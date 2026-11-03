import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { SCORES_BUCKET } from "@/lib/constants";
import type { Json } from "@/lib/supabase/types";
import { parseAnalysis, sectionAt, sectionLabel, type ScoreSection } from "@/lib/score-analysis";
import { parseBarMap, parsePageBars, type BarLine, type PageBars } from "@/lib/bar-map";
import type { DetectedLine } from "@/lib/bar-detect";
import { MissingKeyError } from "./assemblyai";
import { anthropicClient, usageRows } from "./draft-lesson";
import { musicModel } from "./read-music";
import { claudeCost, type ClaudeUsage } from "./pricing";

// Making a score's bar map, once per upload. The browser has already found the
// lines of music and their bar lines in each page image (bar-detect.ts); here
// Claude looks at the pages and says which piece each line belongs to and the
// number of its first bar. Where Claude's own count of bars on a line, or its
// numbering, disagrees with what was found, the line is flagged for the
// teacher to check.

type Db = Awaited<ReturnType<typeof createClient>>;

const PAGES_PER_CALL = 10;
const PARALLEL_CALLS = 4;
const LINK_SECONDS = 60 * 60;

export type DetectedPage = { page: number; lines: DetectedLine[] };
export type NumberBarsResult =
  | { ok: true; pages: number; flagged: number; map: { page: number; bars: PageBars }[] }
  | { ok: false; error: string };

class BarsError extends Error {
  constructor(
    message: string,
    public usage: ClaudeUsage[] = [],
  ) {
    super(message);
  }
}

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["pages"],
  properties: {
    pages: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["page", "lines"],
        properties: {
          page: { type: "integer" },
          lines: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["line", "piece", "first_bar", "bars"],
              properties: {
                line: { type: "integer" },
                piece: { type: "integer" },
                first_bar: { type: "integer" },
                bars: { type: "integer" },
              },
            },
          },
        },
      },
    },
  },
} as const;

const SYSTEM = `You number the bars (measures) in a student's sheet music. You see pages as images, each labelled with its upload page number. A bar-line finder has already found the lines of music (staff systems) on each page, numbered from the top of the page, with where each line sits and how many bars it found on it.

For every line listed, give:
- piece: the number of the piece from the list that this line belongs to, or 0 if it is not part of any listed piece.
- first_bar: the number of the first bar on that line, counting from the start of its piece. The first full bar of a piece is bar 1; an incomplete opening bar (a pickup, upbeat or anacrusis) is bar 0. If a bar number is printed at the start of the line, that number is right: use it. Otherwise count on from the line before. Repeat signs don't restart the count; first and second endings are counted as separate bars, the way printed bar numbers do. A new piece, movement or exercise starting on a line starts again from 1 (or 0 with a pickup).
- bars: how many bars YOU count on that line (a pickup counts as one, and so does a bar that runs on to the next line). Count it yourself; the finder can miss a bar line or take a note stem for one.

Lines are given top to bottom; match them to the staff systems you see in that order. Return every listed line of every page.`;

function pct(v: number): string {
  return `${Math.round(v * 100)}%`;
}

function pageText(p: DetectedPage, section: ScoreSection | null): string {
  const head = `Upload page ${p.page}${section ? ` (${sectionLabel(section)})` : ""}: ${p.lines.length} line${p.lines.length === 1 ? "" : "s"} of music found.`;
  const lines = p.lines.map(
    (l, i) =>
      `Line ${i + 1}: ${pct(l.top)}–${pct(l.bottom)} down the page${l.staves > 1 ? `, ${l.staves} staves` : ""}, ${l.dividers.length + 1} bars found` +
      (l.dividers.length ? ` (bar lines ${l.dividers.map(pct).join(", ")} across)` : ""),
  );
  return [head, ...lines].join("\n");
}

type Answer = Map<number, Map<number, { piece: number; first_bar: number; bars: number }>>;

async function askClaude(
  batch: { p: DetectedPage; url: string; section: ScoreSection | null }[],
  pieces: ScoreSection[],
): Promise<{ answer: Answer; usage: ClaudeUsage[] }> {
  const content: Anthropic.Beta.BetaContentBlockParam[] = [
    {
      type: "text",
      text: `Pieces in this music:\n${pieces.map((s, i) => `${i + 1}. ${sectionLabel(s)} (upload ${s.end_page > s.start_page ? `pages ${s.start_page}–${s.end_page}` : `page ${s.start_page}`})`).join("\n")}`,
    },
  ];
  for (const b of batch) {
    content.push({ type: "text", text: pageText(b.p, b.section) });
    content.push({ type: "image", source: { type: "url", url: b.url } });
  }
  content.push({ type: "text", text: "Give the piece and first bar number of every line listed." });

  const stream = anthropicClient().beta.messages.stream({
    model: musicModel(),
    max_tokens: 8000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
    system: SYSTEM,
    messages: [{ role: "user", content }],
  });
  const message = await stream.finalMessage();
  const usage = usageRows(message);
  if (message.stop_reason === "refusal") throw new BarsError("Claude declined to number these bars.", usage);
  const text = message.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  const answer: Answer = new Map();
  try {
    const raw = JSON.parse(text) as {
      pages?: { page: number; lines?: { line: number; piece: number; first_bar: number; bars: number }[] }[];
    };
    for (const p of raw.pages ?? []) {
      const m = new Map<number, { piece: number; first_bar: number; bars: number }>();
      for (const l of p.lines ?? []) m.set(Number(l.line), l);
      answer.set(Number(p.page), m);
    }
  } catch {
    throw new BarsError("Claude's answer couldn't be read. Try again.", usage);
  }
  return { answer, usage };
}

/** Groups pages into calls, starting a new call where a piece starts when it can. */
function batches<T extends { p: DetectedPage }>(pages: T[], sections: ScoreSection[]): T[][] {
  const starts = new Set(sections.map((s) => s.start_page));
  const out: T[][] = [];
  let cur: T[] = [];
  for (const x of pages) {
    const full = cur.length >= PAGES_PER_CALL;
    const goodBreak = starts.has(x.p.page) && cur.length >= PAGES_PER_CALL - 3;
    if (cur.length && (full || goodBreak)) {
      out.push(cur);
      cur = [];
    }
    cur.push(x);
  }
  if (cur.length) out.push(cur);
  return out;
}

/** The finished map of one page: found lines + Claude's numbers, flagging disagreements. */
function buildPage(
  p: DetectedPage,
  said: Map<number, { piece: number; first_bar: number; bars: number }> | undefined,
  pieces: ScoreSection[],
  pageSection: ScoreSection | null,
  prev: BarLine | null,
  madeAt: string,
): PageBars {
  const lines: BarLine[] = [];
  let before = prev;
  p.lines.forEach((d, i) => {
    const count = d.dividers.length + 1;
    const a = said?.get(i + 1);
    const piece = a && a.piece >= 1 && a.piece <= pieces.length ? sectionLabel(pieces[a.piece - 1]) : "";
    const label = a ? piece : pageSection ? sectionLabel(pageSection) : "";
    // What the line before says this one should start on.
    const follows = before && before.piece === label ? before.first + lineCount(before) : null;
    const first = a ? Math.max(0, a.first_bar) : (follows ?? 1);
    // Flag it when Claude didn't answer for it, counted a different number of
    // bars than were found, or numbered it out of step with the line before.
    const check = !a || a.bars !== count || (follows !== null && first > 1 && first !== follows);
    const line: BarLine = {
      top: d.top,
      bottom: d.bottom,
      left: d.left,
      right: d.right,
      dividers: d.dividers,
      staves: d.staves,
      first,
      piece: label,
      check,
    };
    lines.push(line);
    before = line;
  });
  return { lines, checked: false, made_at: madeAt };
}

function lineCount(l: BarLine): number {
  return l.dividers.length + 1;
}

function clean(lines: DetectedLine[]): DetectedLine[] {
  const f = (v: unknown) => Math.min(Math.max(Number(v) || 0, 0), 1);
  return (Array.isArray(lines) ? lines : [])
    .slice(0, 40)
    .map((l) => ({
      top: f(l.top),
      bottom: f(l.bottom),
      left: f(l.left),
      right: f(l.right),
      dividers: (Array.isArray(l.dividers) ? l.dividers : []).slice(0, 60).map(f),
      staves: Math.min(4, Math.max(1, Math.round(Number(l.staves) || 1))),
    }))
    .filter((l) => l.bottom > l.top && l.right > l.left);
}

/**
 * Numbers the bars on the pages the browser measured and saves the bar map on
 * the score's pages. Pages not sent keep the map they had.
 */
export async function numberBars(teacherId: string, scoreId: string, detected: DetectedPage[]): Promise<NumberBarsResult> {
  const db = await createClient();
  const { data: score } = await db.from("scores").select("*").eq("id", scoreId).maybeSingle();
  if (!score) return { ok: false, error: "That music wasn't found." };
  const rawPages = Array.isArray(score.pages) ? (score.pages as Record<string, unknown>[]) : [];
  const sections = parseAnalysis(score.analysis)?.sections ?? [];
  if (!sections.length) return { ok: false, error: "Let Claude read the music first, so it knows the pieces." };

  const sent = new Map<number, DetectedPage>();
  for (const d of Array.isArray(detected) ? detected : []) {
    const page = Math.round(Number(d?.page));
    if (page >= 1 && page <= rawPages.length) sent.set(page, { page, lines: clean(d.lines) });
  }
  const pages = [...sent.values()].sort((a, b) => a.page - b.page);
  if (!pages.length) return { ok: false, error: "No pages were measured." };

  const paths = pages.map((p) => String(rawPages[p.page - 1]?.path ?? ""));
  const { data: signed } = await db.storage.from(SCORES_BUCKET).createSignedUrls(paths, LINK_SECONDS);
  const withUrls = pages.map((p, i) => ({
    p,
    url: signed?.find((s) => s.path === paths[i])?.signedUrl ?? "",
    section: sectionAt(sections, p.page),
  }));
  if (withUrls.some((x) => !x.url)) return { ok: false, error: "Couldn't open the page images. Try again." };

  let usage: ClaudeUsage[] = [];
  const answer: Answer = new Map();
  try {
    // Only pages with lines on them need Claude.
    const ask = withUrls.filter((x) => x.p.lines.length);
    const groups = batches(ask, sections);
    for (let i = 0; i < groups.length; i += PARALLEL_CALLS) {
      const results = await Promise.allSettled(groups.slice(i, i + PARALLEL_CALLS).map((g) => askClaude(g, sections)));
      for (const r of results) {
        if (r.status === "fulfilled") {
          usage = [...usage, ...r.value.usage];
          for (const [k, v] of r.value.answer) answer.set(k, v);
        } else {
          if (r.reason instanceof BarsError) usage = [...usage, ...r.reason.usage];
          throw r.reason;
        }
      }
    }
  } catch (e) {
    await logUsage(db, teacherId, scoreId, usage);
    console.error("numberBars", scoreId, e);
    const error =
      e instanceof BarsError || e instanceof MissingKeyError ? e.message : "Numbering the bars didn't work. Try again.";
    return { ok: false, error };
  }

  const madeAt = new Date().toISOString();
  const built = new Map<number, PageBars>();
  let prev: BarLine | null = null;
  for (const x of withUrls) {
    // A gap in the pages sent means the line before isn't known.
    if (!sent.has(x.p.page - 1)) prev = null;
    const bars = buildPage(x.p, answer.get(x.p.page), sections, x.section, prev, madeAt);
    built.set(x.p.page, bars);
    prev = bars.lines[bars.lines.length - 1] ?? prev;
  }

  // Save on the pages as they are now (a Replace file meanwhile wins).
  const { data: fresh } = await db.from("scores").select("pages").eq("id", scoreId).maybeSingle();
  const now = Array.isArray(fresh?.pages) ? (fresh.pages as Record<string, unknown>[]) : [];
  if (now.length !== rawPages.length || now.some((p, i) => p?.path !== rawPages[i]?.path)) {
    await logUsage(db, teacherId, scoreId, usage);
    return { ok: false, error: "The music was replaced while the bars were being numbered. Try again." };
  }
  const next = now.map((p, i) => (built.has(i + 1) ? { ...p, bars: built.get(i + 1) } : p));
  const { error } = await db
    .from("scores")
    .update({ pages: next as unknown as Json })
    .eq("id", scoreId);
  await logUsage(db, teacherId, scoreId, usage);
  if (error) return { ok: false, error: "Couldn't save the bar map. Try again." };
  const flagged = [...built.values()].reduce((n, p) => n + p.lines.filter((l) => l.check).length, 0);
  return { ok: true, pages: built.size, flagged, map: [...built].map(([page, bars]) => ({ page, bars })) };
}

/** Saves the teacher's corrections to one page's bar map (and the pages whose numbers moved with it). */
export async function saveBarPages(
  scoreId: string,
  changes: { page: number; bars: unknown }[],
): Promise<{ ok: boolean; error?: string }> {
  const db = await createClient();
  const { data: score } = await db.from("scores").select("pages").eq("id", scoreId).maybeSingle();
  if (!score) return { ok: false, error: "That music wasn't found." };
  const now = Array.isArray(score.pages) ? (score.pages as Record<string, unknown>[]) : [];
  const current = parseBarMap(now);
  const next = now.map((p, i) => {
    const c = (Array.isArray(changes) ? changes : []).find((x) => Number(x?.page) === i + 1);
    const bars = c ? parsePageBars(c.bars) : null;
    if (!bars || !current[i]) return p;
    return { ...p, bars: { ...bars, made_at: current[i]!.made_at } };
  });
  const { error } = await db
    .from("scores")
    .update({ pages: next as unknown as Json })
    .eq("id", scoreId);
  return error ? { ok: false, error: "Couldn't save. Try again." } : { ok: true };
}

async function logUsage(db: Db, teacherId: string, scoreId: string, usage: ClaudeUsage[]) {
  if (!usage.length) return;
  await db.from("ai_usage").insert(
    usage.map((u) => ({
      teacher_id: teacherId,
      score_id: scoreId,
      kind: "music",
      provider: "anthropic",
      model: u.model,
      input_tokens: u.input_tokens,
      output_tokens: u.output_tokens,
      cache_read_tokens: u.cache_read_tokens,
      cache_write_tokens: u.cache_write_tokens,
      cost_usd: Math.round(claudeCost(u) * 1e6) / 1e6,
    })),
  );
}
