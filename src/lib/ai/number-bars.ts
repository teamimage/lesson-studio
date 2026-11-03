import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { Database, Json } from "@/lib/supabase/types";
import { sectionLabel, type ScoreSection } from "@/lib/score-analysis";
import { parseBarMap, parsePageBars, type BarLine, type PageBars } from "@/lib/bar-map";
import type { DetectedLine } from "@/lib/bar-detect";
import { anthropicClient, usageRows } from "./draft-lesson";
import { musicModel } from "./read-music";
import { claudeCost, type ClaudeUsage } from "./pricing";

// Numbering a score's bars, for the bar map job (bar-job.ts). The server has
// already found the lines of music and their bar lines in each page image
// (bar-detect.ts); here Claude looks at the pages and says, for each line,
// whether it is part of a piece or exercise (mapped) or only an example inside
// the teaching text (left out), which piece it belongs to and the number of
// its first bar. Where Claude's own count of bars on a line, or its
// numbering, disagrees with what was found, the line is flagged for the
// teacher to check.

export type Db = SupabaseClient<Database>;

export type DetectedPage = { page: number; lines: DetectedLine[] };

/** What Claude said about one line of music. */
export type LineAnswer = { piece: number; first_bar: number; bars: number; kind: LineKind; title: string };
export type LineKind = "piece" | "exercise" | "example";
/** Claude's answers by page, then by line number (from 1). */
export type Answer = Map<number, Map<number, LineAnswer>>;

export class BarsError extends Error {
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
              required: ["line", "kind", "piece", "title", "first_bar", "bars"],
              properties: {
                line: { type: "integer" },
                kind: { type: "string", enum: ["piece", "exercise", "example"] },
                piece: { type: "integer" },
                title: { type: "string" },
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
- kind: what the line is.
  - "piece": part of a piece of music the student plays (a solo, a movement, a song).
  - "exercise": part of an exercise or study the student plays as a whole: a numbered or titled exercise, etude, position study, scale or arpeggio study, a practice drill printed as music to play through.
  - "example": music printed only to illustrate the teaching text: a few notes showing a bowing, fingering, rhythm or tonalization point, a sample or excerpt quoted inside an explanation, a fingering chart or a diagram drawn on a staff. Also anything that isn't really music (text, a picture, a chart) that the finder took for a line. When a page is mostly explanation with small musical examples between paragraphs, those lines are "example". When unsure between "exercise" and "example", ask whether a teacher would assign it to be practised by itself: if so it is an exercise.
- piece: the number of the piece from the list that this line belongs to, or 0 if it is not part of any listed piece.
- title: the name of the piece or exercise as printed (e.g. "Exercise 3", "Gavotte"), "" if none is printed or the line is an example.
- first_bar: the number of the first bar on that line, counting from the start of its piece or exercise. The first full bar is bar 1; an incomplete opening bar (a pickup, upbeat or anacrusis) is bar 0. If a bar number is printed at the start of the line, that number is right: use it. Otherwise count on from the line before. Repeat signs don't restart the count; first and second endings are counted as separate bars, the way printed bar numbers do. A new piece, movement or exercise starting on a line starts again from 1 (or 0 with a pickup). For an example, give 0.
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

const KINDS: LineKind[] = ["piece", "exercise", "example"];

/** Asks Claude about one group of pages. Gives up after `timeoutMs` so a slow call can't outlive the server function. */
export async function askClaude(
  batch: { p: DetectedPage; url: string; section: ScoreSection | null }[],
  pieces: ScoreSection[],
  timeoutMs: number,
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
  content.push({ type: "text", text: "Give the kind, piece and first bar number of every line listed." });

  const stream = anthropicClient().beta.messages.stream(
    {
      model: musicModel(),
      max_tokens: 8000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
      system: SYSTEM,
      messages: [{ role: "user", content }],
    },
    { signal: AbortSignal.timeout(timeoutMs) },
  );
  const message = await stream.finalMessage();
  const usage = usageRows(message);
  if (message.stop_reason === "refusal") throw new BarsError("Claude declined to number these bars.", usage);
  const text = message.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  const answer: Answer = new Map();
  try {
    const raw = JSON.parse(text) as {
      pages?: { page: number; lines?: (Partial<LineAnswer> & { line: number })[] }[];
    };
    for (const p of raw.pages ?? []) {
      const m = new Map<number, LineAnswer>();
      for (const l of p.lines ?? [])
        m.set(Number(l.line), {
          piece: Math.round(Number(l.piece)) || 0,
          first_bar: Math.round(Number(l.first_bar)) || 0,
          bars: Math.round(Number(l.bars)) || 0,
          kind: KINDS.includes(l.kind as LineKind) ? (l.kind as LineKind) : "piece",
          title: typeof l.title === "string" ? l.title.slice(0, 80) : "",
        });
      answer.set(Number(p.page), m);
    }
  } catch {
    throw new BarsError("Claude's answer couldn't be read.", usage);
  }
  return { answer, usage };
}

/** Groups pages into calls of at most `size`, starting a new call where a piece starts when it can. */
export function batches<T extends { p: DetectedPage }>(pages: T[], sections: ScoreSection[], size: number): T[][] {
  const starts = new Set(sections.map((s) => s.start_page));
  const out: T[][] = [];
  let cur: T[] = [];
  for (const x of pages) {
    const full = cur.length >= size;
    const goodBreak = starts.has(x.p.page) && cur.length >= size - 2;
    if (cur.length && (full || goodBreak)) {
      out.push(cur);
      cur = [];
    }
    cur.push(x);
  }
  if (cur.length) out.push(cur);
  return out;
}

/**
 * The finished map of one page: found lines + Claude's numbers, flagging
 * disagreements. Lines Claude called examples are left out.
 */
export function buildPage(
  p: DetectedPage,
  said: Map<number, LineAnswer> | undefined,
  pieces: ScoreSection[],
  pageSection: ScoreSection | null,
  prev: BarLine | null,
  madeAt: string,
): { bars: PageBars; skipped: number } {
  const lines: BarLine[] = [];
  let skipped = 0;
  let before = prev;
  p.lines.forEach((d, i) => {
    const count = d.dividers.length + 1;
    const a = said?.get(i + 1);
    if (a?.kind === "example") {
      skipped++;
      return;
    }
    const piece = a && a.piece >= 1 && a.piece <= pieces.length ? sectionLabel(pieces[a.piece - 1]) : "";
    // An exercise that isn't one of the listed pieces goes by its printed name.
    const label = a ? piece || (a.kind === "exercise" ? a.title : "") : pageSection ? sectionLabel(pageSection) : "";
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
  return { bars: { lines, checked: false, made_at: madeAt }, skipped };
}

function lineCount(l: BarLine): number {
  return l.dividers.length + 1;
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

export async function logUsage(db: Db, teacherId: string, scoreId: string, usage: ClaudeUsage[]) {
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
