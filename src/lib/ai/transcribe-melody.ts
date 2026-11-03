import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { SCORES_BUCKET } from "@/lib/constants";
import { parsePages } from "@/lib/stand-timeline";
import { parseAnalysis, type ScoreSection } from "@/lib/score-analysis";
import { parseMelody, sectionKey, type MelodySection, type ScoreMelody } from "@/lib/melody";
import type { Json } from "@/lib/supabase/types";
import { MissingKeyError } from "./assemblyai";
import { anthropicClient, usageRows } from "./draft-lesson";
import { musicModel } from "./read-music";
import { claudeCost, type ClaudeUsage } from "./pricing";

// Once per uploaded piece, Claude reads its pages and writes the melody out
// as note names, bar by bar. Practice sessions are then matched against it
// in plain code (src/lib/melody.ts), so a session review can say "Gavotte,
// bars 1-24" for the student's own edition, not only for pieces Claude
// happens to know.
//
// A book can have dozens of pieces, so each call does a few and the Music
// page keeps calling until all are done. Costs show under Settings -> AI
// costs as reading music.

type Db = Awaited<ReturnType<typeof createClient>>;

/** Pieces per call (read in parallel). */
const PER_CALL = 4;
/** Pages of one piece sent to Claude. */
const MAX_SECTION_PAGES = 6;
const LINK_SECONDS = 60 * 60;

export const MELODY_SETUP_ERROR = "Reading the notes isn't set up yet. Run score-melody.sql in the Supabase SQL Editor.";

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["key_signature", "time_signature", "bars"],
  properties: {
    key_signature: { type: "string" },
    time_signature: { type: "string" },
    bars: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["bar", "page", "notes"],
        properties: {
          bar: { type: "integer" },
          page: { type: "integer" },
          notes: { type: "string" },
        },
      },
    },
  },
} as const;

const SYSTEM = `You read printed sheet music and write out its melody as note names, so a practice app can recognise the piece from the notes a student plays.

You get the pages of one piece (or one movement), each labelled with its page number in the upload. Write every bar of the piece in order:
- bar: the bar (measure) number. Use the bar numbers printed at the start of each line when there are any; otherwise count from 1 at the first full bar (a pickup bar is 0).
- page: the upload page number the bar is on.
- notes: the notes of the bar in order, separated by spaces, as sounding pitch in scientific notation (C4 is middle C; cello open strings are C2 G2 D3 A3, violin G3 D4 A4 E5). Use sharps or flats as printed with the key signature applied (F#4, Bb3). Leave out rests. A tied note is written once. Repeat a repeated note each time it is played. For chords or double stops write only the top note. For piano music write the right-hand melody only. Treble-clef cello parts sound as written.
- Write repeats out only as printed (do not expand repeat signs).
- key_signature, e.g. "D major"; time_signature, e.g. "4/4". Empty when there is none.

Only write what is on these pages; if a page holds the end of the previous piece or the start of the next one, leave those bars out. If a note is unclear, give your best reading.`;

class MelodyError extends Error {
  constructor(
    message: string,
    public usage: ClaudeUsage[] = [],
  ) {
    super(message);
  }
}

async function readSection(
  section: ScoreSection,
  urls: { page: number; url: string }[],
): Promise<{ result: Omit<MelodySection, "title" | "display" | "start_page" | "end_page" | "status">; usage: ClaudeUsage[] }> {
  const anthropic = anthropicClient();
  const name = [section.title, section.movement].filter(Boolean).join(", ");
  const content: Anthropic.Beta.BetaContentBlockParam[] = [
    { type: "text", text: `Piece: ${name}${section.composer ? ` (${section.composer})` : ""}.` },
  ];
  for (const u of urls) {
    content.push({ type: "text", text: `Page ${u.page}:` });
    content.push({ type: "image", source: { type: "url", url: u.url } });
  }
  content.push({ type: "text", text: "Write out the melody bar by bar." });
  const stream = anthropic.beta.messages.stream({
    model: musicModel(),
    max_tokens: 32000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
    system: SYSTEM,
    messages: [{ role: "user", content }],
  });
  const message = await stream.finalMessage();
  const usage = usageRows(message);
  if (message.stop_reason === "refusal") throw new MelodyError("Claude declined to read these notes.", usage);
  if (message.stop_reason === "max_tokens") throw new MelodyError("The piece came out too long to write out.", usage);
  const text = message.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  try {
    const raw = JSON.parse(text) as { key_signature: string; time_signature: string; bars: MelodySection["bars"] };
    const bars = (raw.bars ?? [])
      .filter((b) => typeof b.notes === "string" && b.notes.trim())
      .map((b) => ({ bar: Math.round(Number(b.bar)) || 0, page: Math.round(Number(b.page)) || section.start_page, notes: b.notes.trim().slice(0, 400) }))
      .slice(0, 600);
    return {
      result: {
        ...(raw.key_signature ? { key_signature: raw.key_signature.slice(0, 40) } : {}),
        ...(raw.time_signature ? { time_signature: raw.time_signature.slice(0, 20) } : {}),
        bars,
      },
      usage,
    };
  } catch {
    throw new MelodyError("Claude's notes couldn't be read.", usage);
  }
}

/** The pieces of a score whose notes are worth reading. */
function wantedSections(score: { title: string; analysis: Json | null; pages: Json }): ScoreSection[] {
  const a = parseAnalysis(score.analysis);
  const pages = parsePages(score.pages).length;
  if (!a) return [];
  const sections = a.sections.filter((s) => s.status !== "other" && s.start_page <= pages);
  if (sections.length || a.sections.length) return sections;
  // Nothing listed (a single sheet): the whole upload as one piece.
  return [
    {
      title: score.title,
      composer: "",
      movement: "",
      start_page: 1,
      end_page: Math.min(pages, MAX_SECTION_PAGES),
      book_piece: "",
      repertoire_title: "",
      status: "other",
    },
  ];
}

export type MelodyProgress = { done: number; total: number; errors: number; error?: string };

export function melodyProgress(score: { title: string; analysis: Json | null; pages: Json; melody?: Json | null }): MelodyProgress {
  const wanted = wantedSections(score);
  const m = parseMelody(score.melody ?? null);
  const entries = wanted.map((s) => m.sections[sectionKey(s)]).filter(Boolean);
  return { done: entries.length, total: wanted.length, errors: entries.filter((e) => e.status === "error").length };
}

/**
 * Reads the notes of the next few pieces that haven't been read. With
 * `retryErrors`, pieces that failed before are tried again.
 */
export async function transcribeNext(teacherId: string, scoreId: string, retryErrors = false): Promise<MelodyProgress> {
  const db = await createClient();
  const { data: score, error } = await db.from("scores").select("id, title, pages, analysis, melody").eq("id", scoreId).maybeSingle();
  if (error) return { done: 0, total: 0, errors: 0, error: /melody/.test(error.message) ? MELODY_SETUP_ERROR : error.message };
  if (!score) return { done: 0, total: 0, errors: 0, error: "That music wasn't found." };

  const melody = parseMelody(score.melody);
  if (retryErrors) for (const [k, v] of Object.entries(melody.sections)) if (v.status === "error") delete melody.sections[k];
  const wanted = wantedSections(score);
  const pending = wanted.filter((s) => !melody.sections[sectionKey(s)]).slice(0, PER_CALL);
  if (!pending.length) {
    if (retryErrors) await save(db, scoreId, melody);
    return melodyProgress({ ...score, melody: melody as unknown as Json });
  }

  const pages = parsePages(score.pages);
  const usage: ClaudeUsage[] = [];
  const results = await Promise.all(
    pending.map(async (s): Promise<[string, MelodySection]> => {
      const base = {
        title: s.title,
        display: s.repertoire_title || s.book_piece || [s.title, s.movement].filter(Boolean).join(", "),
        start_page: s.start_page,
        end_page: s.end_page,
      };
      try {
        const nums: number[] = [];
        for (let p = s.start_page; p <= Math.min(s.end_page, s.start_page + MAX_SECTION_PAGES - 1); p++) nums.push(p);
        const paths = nums.map((n) => pages[n - 1]?.path).filter((x): x is string => !!x);
        const { data: signed } = await db.storage.from(SCORES_BUCKET).createSignedUrls(paths, LINK_SECONDS);
        const urls = nums.flatMap((n) => {
          const url = signed?.find((x) => x.path === pages[n - 1]?.path)?.signedUrl;
          return url ? [{ page: n, url }] : [];
        });
        if (!urls.length) throw new MelodyError("Couldn't open the page images.");
        const out = await readSection(s, urls);
        usage.push(...out.usage);
        return [sectionKey(s), { ...base, status: "done", ...out.result }];
      } catch (e) {
        if (e instanceof MelodyError) usage.push(...e.usage);
        const message = e instanceof MelodyError || e instanceof MissingKeyError ? e.message : "Reading the notes didn't work.";
        if (!(e instanceof MelodyError)) console.error("transcribeNext", scoreId, s.title, e);
        return [sectionKey(s), { ...base, status: "error", error: message, bars: [] }];
      }
    }),
  );

  // Another tab may have saved pieces meanwhile: merge with what's there now.
  const { data: fresh } = await db.from("scores").select("melody").eq("id", scoreId).maybeSingle();
  const merged = parseMelody(fresh?.melody ?? null);
  if (retryErrors) for (const [k, v] of Object.entries(merged.sections)) if (v.status === "error") delete merged.sections[k];
  for (const [k, v] of results) merged.sections[k] = v;
  await save(db, scoreId, merged);
  await logUsage(db, teacherId, scoreId, usage);
  return melodyProgress({ ...score, melody: merged as unknown as Json });
}

async function save(db: Db, scoreId: string, melody: ScoreMelody) {
  await db
    .from("scores")
    .update({ melody: melody as unknown as Json })
    .eq("id", scoreId);
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

/** Every piece with notes read, from the student's music on the stand. */
export async function studentMelodies(db: Db, studentId: string) {
  const { data, error } = await db.from("scores").select("title, melody").eq("student_id", studentId).eq("archived", false);
  if (error || !data) return [];
  return data.flatMap((s) =>
    Object.values(parseMelody(s.melody).sections)
      .filter((sec) => sec.status === "done" && sec.bars.length)
      .map((section) => ({ scoreTitle: s.title, section })),
  );
}

/** Notes-read progress for each of a student's scores (by id). */
export async function melodyProgressFor(studentId: string): Promise<Record<string, MelodyProgress>> {
  const db = await createClient();
  const { data, error } = await db
    .from("scores")
    .select("id, title, pages, analysis, analysis_status, melody")
    .eq("student_id", studentId)
    .eq("archived", false);
  if (error) {
    // Before score-melody.sql has run there's no melody column.
    if (!/melody/.test(error.message)) return {};
    const { data: plain } = await db.from("scores").select("id").eq("student_id", studentId).eq("analysis_status", "done").eq("archived", false);
    return Object.fromEntries((plain ?? []).map((s) => [s.id, { done: 0, total: 1, errors: 0, error: MELODY_SETUP_ERROR }]));
  }
  return Object.fromEntries(
    (data ?? []).filter((s) => s.analysis_status === "done").map((s) => [s.id, melodyProgress(s)]),
  );
}
