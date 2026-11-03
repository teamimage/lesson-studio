import "server-only";
import { randomUUID } from "node:crypto";
import jpeg from "jpeg-js";
import type { Json } from "@/lib/supabase/types";
import { SCORES_BUCKET } from "@/lib/constants";
import { parseAnalysis, sectionAt, type ScoreSection } from "@/lib/score-analysis";
import { detectBars, type DetectedLine } from "@/lib/bar-detect";
import type { BarLine, PageBars } from "@/lib/bar-map";
import { MissingKeyError } from "./assemblyai";
import { askClaude, batches, BarsError, buildPage, logUsage, type Db, type LineAnswer } from "./number-bars";
import type { ClaudeUsage } from "./pricing";

// Making a score's bar map as a job on the server, so it finishes whether or
// not the page that started it is still open.
//
// The work is split into short steps (find the bar lines on the pages, then
// Claude numbers a few pages at a time, then the map is saved). Each step runs
// after the server has answered the request that asked for it, saves where it
// got to, and asks the server for the next step itself. Every step fits well
// inside the server's time limit, so a big book can't run out of time the way
// one long request did. If a step is cut off anyway, the job's state is saved:
// opening the Bar map page again carries on from there.
//
// The job's state lives in scores.analysis.bar_job (no new column needed).

/** Seconds a step may run before it hands over to the next one. */
const STEP_BUDGET_MS = 150_000;
/** A Claude call that takes longer than this is given up and tried again. */
const CLAUDE_TIMEOUT_MS = 200_000;
/** A running job not heard from for this long was cut off, and can be carried on. */
export const STALE_MS = 6 * 60_000;
const PAGES_PER_CALL = 6;
const PARALLEL_CALLS = 3;
const MAX_TRIES = 3;
// Wide enough for thin bar lines to survive (the same as the browser used).
const DETECT_WIDTH = 1400;
const LINK_SECONDS = 60 * 60;

type Phase = "measure" | "number" | "save";

export type BarJob = {
  run: string;
  status: "running" | "done" | "error";
  phase: Phase;
  /** 0–100. */
  progress: number;
  started_at: string;
  updated_at: string;
  /** Changes each step, so two copies of a step can't both save. */
  lease: string;
  /** Pages to map (the pages inside a piece). */
  pages: number[];
  /** Lines and bar lines found on each page, by page number. */
  found: Record<string, DetectedLine[]>;
  /** Claude's answers by page, then line number. */
  answers: Record<string, Record<string, LineAnswer>>;
  /** Failed Claude calls, by the first page of the call. */
  tries: Record<string, number>;
  error?: string;
  result?: { pages: number; flagged: number; skipped: number };
};

/** What the page sees of a job. */
export type BarJobView = {
  status: "none" | "running" | "done" | "error";
  phase?: Phase;
  progress: number;
  stale: boolean;
  error?: string;
  result?: BarJob["result"];
  updated_at?: string;
};

export function readJob(analysis: Json | null): BarJob | null {
  if (!analysis || typeof analysis !== "object" || Array.isArray(analysis)) return null;
  const j = (analysis as Record<string, unknown>).bar_job;
  if (!j || typeof j !== "object" || Array.isArray(j)) return null;
  const o = j as BarJob;
  if (typeof o.run !== "string" || !Array.isArray(o.pages)) return null;
  return { ...o, found: o.found ?? {}, answers: o.answers ?? {}, tries: o.tries ?? {} };
}

export function viewJob(job: BarJob | null): BarJobView {
  if (!job) return { status: "none", progress: 0, stale: false };
  const stale = job.status === "running" && Date.now() - Date.parse(job.updated_at) > STALE_MS;
  return {
    status: job.status,
    phase: job.phase,
    progress: job.progress,
    stale,
    error: job.error,
    result: job.result,
    updated_at: job.updated_at,
  };
}

/** Pages with music to map: the pages inside a piece. */
function musicPages(pageCount: number, sections: ScoreSection[]): number[] {
  const out: number[] = [];
  for (let n = 1; n <= pageCount; n++) if (sectionAt(sections, n)) out.push(n);
  return out;
}

function progressOf(job: BarJob): number {
  const measured = job.pages.filter((n) => job.found[n]).length;
  if (job.phase === "measure") return Math.round((measured / Math.max(1, job.pages.length)) * 15);
  if (job.phase === "number") {
    const ask = job.pages.filter((n) => job.found[n]?.length);
    const answered = ask.filter((n) => job.answers[n]).length;
    return 15 + Math.round((answered / Math.max(1, ask.length)) * 80);
  }
  return job.status === "done" ? 100 : 97;
}

/**
 * Saves the job, but only if no other copy of this step took it over
 * meanwhile. Returns false when the job is no longer ours (a new run started,
 * the music was read again or replaced): then this step stops.
 */
async function saveJob(db: Db, scoreId: string, job: BarJob, prevLease: string, extra: Record<string, Json> = {}) {
  const { data: fresh } = await db.from("scores").select("analysis").eq("id", scoreId).maybeSingle();
  const now = readJob(fresh?.analysis ?? null);
  if (!fresh?.analysis || !now || now.run !== job.run || now.lease !== prevLease) return false;
  job.updated_at = new Date().toISOString();
  job.progress = progressOf(job);
  const analysis = { ...(fresh.analysis as Record<string, Json>), bar_job: job as unknown as Json };
  const { data, error } = await db
    .from("scores")
    .update({ analysis: analysis as Json, ...extra })
    .eq("id", scoreId)
    .eq("analysis->bar_job->>lease", prevLease)
    .select("id");
  if (error) console.error("bar job save", scoreId, error);
  return !error && (data?.length ?? 0) > 0;
}

/**
 * Starts a new bar map job (or, with `resume`, picks up a job that was cut
 * off). Returns the job as the page should show it.
 */
export async function startJob(
  db: Db,
  scoreId: string,
  resume: boolean,
): Promise<{ ok: true; job: BarJobView; run: string; go: boolean } | { ok: false; error: string }> {
  const { data: score } = await db.from("scores").select("analysis, pages").eq("id", scoreId).maybeSingle();
  if (!score) return { ok: false, error: "That music wasn't found." };
  const sections = parseAnalysis(score.analysis)?.sections ?? [];
  if (!sections.length) return { ok: false, error: "Let Claude read the music first, so it knows the pieces." };
  const current = readJob(score.analysis);
  const view = viewJob(current);

  if (current && current.status === "running") {
    // Already going: nothing to do unless it was cut off.
    if (!view.stale) return { ok: true, job: view, run: current.run, go: false };
    if (resume) {
      const lease = randomUUID();
      const prev = current.lease;
      current.lease = lease;
      const ok = await saveJob(db, scoreId, current, prev);
      return ok ? { ok: true, job: viewJob(current), run: current.run, go: true } : { ok: false, error: "Try again." };
    }
  }
  if (resume) return { ok: true, job: view, run: current?.run ?? "", go: false };

  const pageCount = Array.isArray(score.pages) ? score.pages.length : 0;
  const pages = musicPages(pageCount, sections);
  if (!pages.length) return { ok: false, error: "No pages of music were found in the pieces." };
  const now = new Date().toISOString();
  const job: BarJob = {
    run: randomUUID(),
    status: "running",
    phase: "measure",
    progress: 0,
    started_at: now,
    updated_at: now,
    lease: randomUUID(),
    pages,
    found: {},
    answers: {},
    tries: {},
  };
  const analysis = { ...(score.analysis as Record<string, Json>), bar_job: job as unknown as Json };
  const { error } = await db
    .from("scores")
    .update({ analysis: analysis as Json })
    .eq("id", scoreId);
  if (error) return { ok: false, error: "Couldn't start the bar map. Try again." };
  return { ok: true, job: viewJob(job), run: job.run, go: true };
}

/** Pixels of a stored page image, scaled to the width the bar-line finder likes. */
async function pagePixels(url: string): Promise<{ data: Uint8Array; w: number; h: number }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`page image ${res.status}`);
  const img = jpeg.decode(new Uint8Array(await res.arrayBuffer()), { useTArray: true, maxMemoryUsageInMB: 256 });
  const scale = Math.min(1, DETECT_WIDTH / img.width);
  if (scale >= 1) return { data: img.data, w: img.width, h: img.height };
  // Area-average down to the smaller size (what a canvas does when it shrinks a picture).
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const out = new Uint8Array(w * h * 4);
  const sx = img.width / w;
  const sy = img.height / h;
  for (let y = 0; y < h; y++) {
    const y0 = Math.floor(y * sy);
    const y1 = Math.min(img.height, Math.max(y0 + 1, Math.floor((y + 1) * sy)));
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor(x * sx);
      const x1 = Math.min(img.width, Math.max(x0 + 1, Math.floor((x + 1) * sx)));
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (let yy = y0; yy < y1; yy++) {
        let i = (yy * img.width + x0) * 4;
        for (let xx = x0; xx < x1; xx++, i += 4) {
          r += img.data[i];
          g += img.data[i + 1];
          b += img.data[i + 2];
          n++;
        }
      }
      const o = (y * w + x) * 4;
      out[o] = r / n;
      out[o + 1] = g / n;
      out[o + 2] = b / n;
      out[o + 3] = 255;
    }
  }
  return { data: out, w, h };
}

async function signedUrls(db: Db, rawPages: Record<string, unknown>[], pages: number[]) {
  const paths = pages.map((n) => String(rawPages[n - 1]?.path ?? ""));
  const { data } = await db.storage.from(SCORES_BUCKET).createSignedUrls(paths, LINK_SECONDS);
  const urls = new Map<number, string>();
  pages.forEach((n, i) => {
    const u = data?.find((s) => s.path === paths[i])?.signedUrl;
    if (u) urls.set(n, u);
  });
  return urls;
}

/**
 * Runs one step of a score's bar map job. Returns true when there is more to
 * do (the caller asks for the next step).
 */
export async function runStep(db: Db, teacherId: string, scoreId: string, run: string): Promise<boolean> {
  const began = Date.now();
  const { data: score } = await db.from("scores").select("analysis, pages").eq("id", scoreId).maybeSingle();
  const job = readJob(score?.analysis ?? null);
  if (!score || !job || job.run !== run || job.status !== "running") return false;
  // Take the job for this step.
  let lease = job.lease;
  job.lease = randomUUID();
  if (!(await saveJob(db, scoreId, job, lease))) return false;
  lease = job.lease;

  const rawPages = Array.isArray(score.pages) ? (score.pages as Record<string, unknown>[]) : [];
  const sections = parseAnalysis(score.analysis)?.sections ?? [];
  const fail = async (error: string) => {
    job.status = "error";
    job.error = error;
    await saveJob(db, scoreId, job, lease);
    return false;
  };
  /** Saves progress so far under a fresh lease; false when the job was taken from us. */
  const checkpoint = async () => {
    const prev = lease;
    job.lease = lease = randomUUID();
    return saveJob(db, scoreId, job, prev);
  };

  if (job.phase === "measure") {
    const todo = job.pages.filter((n) => !job.found[n]);
    const urls = await signedUrls(db, rawPages, todo);
    let sinceSave = 0;
    for (const n of todo) {
      if (Date.now() - began > STEP_BUDGET_MS) break;
      const url = urls.get(n);
      if (!url) return fail("Couldn't open the page images. Try again.");
      try {
        const px = await pagePixels(url);
        job.found[n] = detectBars(px.data, px.w, px.h);
      } catch (e) {
        console.error("bar job measure", scoreId, n, e);
        // A page that can't be read is mapped as having no lines.
        job.found[n] = [];
      }
      if (++sinceSave >= 4) {
        sinceSave = 0;
        if (!(await checkpoint())) return false;
      }
    }
    if (job.pages.every((n) => job.found[n])) {
      if (!job.pages.some((n) => job.found[n].length)) {
        return fail("No lines of music were found on these pages. A bar map needs clear printed pages (a PDF works best).");
      }
      job.phase = "number";
    }
    return checkpoint();
  }

  if (job.phase === "number") {
    const ask = job.pages.filter((n) => job.found[n]?.length && !job.answers[n]);
    if (!ask.length) {
      job.phase = "save";
      return checkpoint();
    }
    const urls = await signedUrls(db, rawPages, ask);
    const items = ask.map((n) => ({ p: { page: n, lines: job.found[n] }, url: urls.get(n) ?? "", section: sectionAt(sections, n) }));
    if (items.some((x) => !x.url)) return fail("Couldn't open the page images. Try again.");
    const groups = batches(items, sections, PAGES_PER_CALL).slice(0, PARALLEL_CALLS);
    let usage: ClaudeUsage[] = [];
    const results = await Promise.allSettled(groups.map((g) => askClaude(g, sections, CLAUDE_TIMEOUT_MS)));
    let fatal: string | null = null;
    results.forEach((r, i) => {
      const key = String(groups[i][0].p.page);
      if (r.status === "fulfilled") {
        usage = [...usage, ...r.value.usage];
        for (const x of groups[i]) {
          const said = r.value.answer.get(x.p.page);
          // A page Claude skipped gets an empty answer: its lines are flagged to check.
          job.answers[x.p.page] = said ? Object.fromEntries([...said].map(([k, v]) => [String(k), v])) : {};
        }
        delete job.tries[key];
        return;
      }
      if (r.reason instanceof BarsError) usage = [...usage, ...r.reason.usage];
      if (r.reason instanceof MissingKeyError) fatal = r.reason.message;
      console.error("bar job number", scoreId, key, r.reason);
      job.tries[key] = (job.tries[key] ?? 0) + 1;
      if (job.tries[key] >= MAX_TRIES) fatal = "Claude couldn't number some of the pages. Try again.";
    });
    await logUsage(db, teacherId, scoreId, usage);
    if (fatal) return fail(fatal);
    return checkpoint();
  }

  // Save: the found lines and Claude's numbers become the map on each page.
  const madeAt = new Date().toISOString();
  const built = new Map<number, PageBars>();
  let prev: BarLine | null = null;
  let skipped = 0;
  for (const n of job.pages) {
    if (!job.pages.includes(n - 1)) prev = null;
    const said = job.answers[n] ? new Map(Object.entries(job.answers[n]).map(([k, v]) => [Number(k), v])) : undefined;
    const out = buildPage({ page: n, lines: job.found[n] ?? [] }, said, sections, sectionAt(sections, n), prev, madeAt);
    built.set(n, out.bars);
    skipped += out.skipped;
    prev = out.bars.lines[out.bars.lines.length - 1] ?? prev;
  }
  // On the pages as they are now; if the file was replaced meanwhile, the job ends.
  const { data: fresh } = await db.from("scores").select("pages").eq("id", scoreId).maybeSingle();
  const now = Array.isArray(fresh?.pages) ? (fresh.pages as Record<string, unknown>[]) : [];
  if (now.length !== rawPages.length || now.some((p, i) => p?.path !== rawPages[i]?.path)) {
    return fail("The music was replaced while the bars were being numbered. Try again.");
  }
  const next = now.map((p, i) => (built.has(i + 1) ? { ...p, bars: built.get(i + 1) } : p));
  job.status = "done";
  job.phase = "save";
  job.result = {
    pages: built.size,
    flagged: [...built.values()].reduce((s, p) => s + p.lines.filter((l) => l.check).length, 0),
    skipped,
  };
  // The finder's work isn't needed any more; keep the saved job small.
  job.found = {};
  job.answers = {};
  const prevLease = lease;
  job.lease = randomUUID();
  const ok = await saveJob(db, scoreId, job, prevLease, { pages: next as unknown as Json });
  if (!ok) console.error("bar job: couldn't save the map", scoreId);
  return false;
}
