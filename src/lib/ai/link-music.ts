import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";
import { listScores } from "@/lib/scores";
import { formatClock, lessonAiMoments, type AiMoment } from "@/lib/lesson-moments";
import { sectionLabel, type ScoreSection } from "@/lib/score-analysis";
import {
  momentsKey,
  parseBox,
  parseMusicLinks,
  type MusicLinks,
  type MusicRef,
  type StoredLink,
} from "@/lib/music-links";
import type { StandScore } from "@/lib/stand-timeline";
import { MissingKeyError } from "./assemblyai";
import { anthropicClient, usageRows } from "./draft-lesson";
import { musicModel } from "./read-music";
import { claudeCost, type ClaudeUsage } from "./pricing";
import { latestTranscript } from "./process-lesson";

// Lesson review clips → the sheet music they are about.
//
// Step 1 (text): Claude reads the transcript and the list of pieces in the
// student's uploaded music, and says for each AI moment which piece it is
// about and which bars, if any were named.
// Step 2 (pages): for clips that name bars, Claude looks at the piece's pages
// and draws a box around those bars, so the popup can show and highlight them.

type Db = Awaited<ReturnType<typeof createClient>>;

// At most this many page images in step 2 (a long piece is 2–4 pages).
const MAX_IMAGES = 16;
const PAGES_PER_PIECE = 4;

export type LinkResult = {
  status: "done" | "error" | "nothing";
  error?: string | null;
  links?: MusicLinks;
};

type Piece = { n: number; score: StandScore; section: ScoreSection };

class LinkError extends Error {
  constructor(
    message: string,
    public usage: ClaudeUsage[] = [],
  ) {
    super(message);
  }
}

const STEP1_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["links"],
  properties: {
    links: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["moment", "piece", "bars"],
        properties: {
          moment: { type: "integer" },
          piece: { type: "integer" },
          bars: { type: "string" },
        },
      },
    },
  },
} as const;

const STEP1_SYSTEM = `You help a music teacher review a recorded lesson. You get the lesson transcript (with [m:ss] times), a numbered list of moments in the lesson video, and a numbered list of the pieces in the student's uploaded sheet music (book, piece, pages).

For every moment, say which piece of the uploaded music it is about:
- piece: the number of the piece from the music list, or 0 if the moment is not about any of them (warm-up, scales, posture, a piece that isn't uploaded, a break, talk).
- bars: the bar (measure) numbers worked on in that moment if the teacher names or clearly implies them, e.g. "9", "13-15", "1-8"; "" if none. "The first two lines" or "from the beginning" is not a bar number: leave it "" unless the bars are stated.

Use what is said in the transcript from the moment's time until the next moment. A moment belongs to a piece when the teacher is working on that piece (including exercises taken from it, like playing its rhythm on an open string). Use the piece names the teacher says; if a piece is only called by a nickname or "this piece", follow the lesson's context. Return one entry per moment.`;

const STEP2_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["boxes"],
  properties: {
    boxes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["request", "found", "page", "x", "y", "w", "h"],
        properties: {
          request: { type: "integer" },
          found: { type: "boolean" },
          page: { type: "integer" },
          x: { type: "number" },
          y: { type: "number" },
          w: { type: "number" },
          h: { type: "number" },
        },
      },
    },
  },
} as const;

const STEP2_SYSTEM = `You find bars (measures) in sheet music. You see pages of a student's music as images, each labelled with its upload page number and the piece on it. For each request (a piece and a bar range), find those bars and give a box around them.

- Count bars from the start of the piece (the first full bar is bar 1, a pickup bar is bar 0). Use printed bar numbers when they are there (they usually sit above the first bar of a line).
- page: the upload page number where the bars start.
- x, y, w, h: the box as fractions of that page's width and height (0 to 1), from the top-left corner. Cover the whole height of the staff line(s) the bars are on, plus a little margin, and only the width of those bars. If the range runs onto the next line, cover all its lines on that page.
- found: false if you can't find the bars on these pages (then give the piece's first page and a box of 0s).`;

function transcriptText(t: string, maxChars = 120_000): string {
  return t.length > maxChars ? `${t.slice(0, maxChars)}\n[…]` : t;
}

async function step1(
  transcript: string,
  moments: AiMoment[],
  pieces: Piece[],
): Promise<{
  out: { moment: number; piece: number; bars: string }[];
  usage: ClaudeUsage[];
}> {
  const anthropic = anthropicClient();
  const momentList = moments.map((m, i) => `${i + 1}. [${formatClock(m.seconds)}] ${m.label}`).join("\n");
  const pieceList = pieces
    .map((p) => {
      const pages =
        p.section.end_page > p.section.start_page
          ? `pages ${p.section.start_page}-${p.section.end_page}`
          : `page ${p.section.start_page}`;
      return `${p.n}. ${sectionLabel(p.section)}${p.section.book_piece ? ` [${p.section.book_piece}]` : ""} (in "${p.score.title}", ${pages})`;
    })
    .join("\n");
  const stream = anthropic.beta.messages.stream({
    model: musicModel(),
    max_tokens: 8000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: {
      effort: "low",
      format: { type: "json_schema", schema: STEP1_SCHEMA },
    },
    system: STEP1_SYSTEM,
    messages: [
      {
        role: "user",
        content: `Pieces in the uploaded music:\n${pieceList}\n\nMoments in the lesson video:\n${momentList}\n\nTranscript:\n${transcriptText(transcript)}`,
      },
    ],
  });
  const message = await stream.finalMessage();
  const usage = usageRows(message);
  if (message.stop_reason === "refusal") throw new LinkError("Claude declined to match the clips to the music.", usage);
  const text = message.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  try {
    const raw = JSON.parse(text) as {
      links?: { moment: number; piece: number; bars: string }[];
    };
    return { out: Array.isArray(raw.links) ? raw.links : [], usage };
  } catch {
    throw new LinkError("Claude's answer couldn't be read. Try again.", usage);
  }
}

type BoxRequest = { n: number; piece: Piece; bars: string };
type BoxAnswer = { page: number; box: MusicRef["box"] };

async function step2(requests: BoxRequest[]): Promise<{ boxes: Map<number, BoxAnswer>; usage: ClaudeUsage[] }> {
  const boxes = new Map<number, BoxAnswer>();
  if (!requests.length) return { boxes, usage: [] };
  // The pages of each piece asked about, once each.
  const pageList: {
    page: number;
    url: string;
    score: StandScore;
    piece: string;
  }[] = [];
  const seen = new Set<string>();
  for (const r of requests) {
    const s = r.piece.section;
    const last = Math.min(s.end_page, s.start_page + PAGES_PER_PIECE - 1);
    for (let p = s.start_page; p <= last; p++) {
      const k = `${r.piece.score.id}#${p}`;
      const url = r.piece.score.pages[p - 1]?.url;
      if (seen.has(k) || !url || pageList.length >= MAX_IMAGES) continue;
      seen.add(k);
      pageList.push({
        page: p,
        url,
        score: r.piece.score,
        piece: sectionLabel(s, false),
      });
    }
  }
  if (!pageList.length) return { boxes, usage: [] };
  const multiScore = new Set(pageList.map((p) => p.score.id)).size > 1;

  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  for (const p of pageList) {
    content.push({
      type: "text",
      text: `Upload page ${p.page}${multiScore ? ` of "${p.score.title}"` : ""} (${p.piece}):`,
    });
    content.push({ type: "image", source: { type: "url", url: p.url } });
  }
  content.push({
    type: "text",
    text:
      "Requests:\n" +
      requests
        .map(
          (r) =>
            `${r.n}. ${sectionLabel(r.piece.section, false)} (pages ${r.piece.section.start_page}-${r.piece.section.end_page}${multiScore ? ` of "${r.piece.score.title}"` : ""}), bars ${r.bars}`,
        )
        .join("\n"),
  });

  const anthropic = anthropicClient();
  const stream = anthropic.beta.messages.stream({
    model: musicModel(),
    max_tokens: 8000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: {
      effort: "medium",
      format: { type: "json_schema", schema: STEP2_SCHEMA },
    },
    system: STEP2_SYSTEM,
    messages: [{ role: "user", content }],
  });
  const message = await stream.finalMessage();
  const usage = usageRows(message);
  const text = message.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  try {
    const raw = JSON.parse(text) as {
      boxes?: {
        request: number;
        found: boolean;
        page: number;
        x: number;
        y: number;
        w: number;
        h: number;
      }[];
    };
    for (const b of raw.boxes ?? []) {
      const req = requests.find((r) => r.n === b.request);
      if (!req || !b.found) continue;
      const s = req.piece.section;
      const page = b.page >= s.start_page && b.page <= s.end_page ? b.page : s.start_page;
      const box = parseBox(b);
      // A box that covers (nearly) the whole page says nothing.
      boxes.set(b.request, {
        page,
        box: box && box.w * box.h < 0.6 ? box : null,
      });
    }
  } catch {
    // Boxes are a nice-to-have; the page and bar numbers still stand.
  }
  return { boxes, usage };
}

/**
 * Matches the lesson's AI moments to the student's uploaded music and saves
 * the links on the transcript row. Runs again only when the moments changed,
 * unless forced ("Match again").
 */
export async function linkLessonMusic(teacherId: string, lessonId: string, force = false): Promise<LinkResult> {
  const db = await createClient();
  const { data: lesson } = await db.from("lessons").select("*").eq("id", lessonId).maybeSingle();
  if (!lesson) return { status: "error", error: "That lesson wasn't found." };
  const row = await latestTranscript(db, lessonId);
  if (!row?.transcript) return { status: "nothing", error: "Process the lesson video first." };
  const moments = lessonAiMoments(row.draft, lesson.teacher_notes);
  if (!moments.length)
    return {
      status: "nothing",
      error: "The AI found no moments in this lesson.",
    };
  const key = momentsKey(moments);
  const existing = parseMusicLinks(row.draft);
  if (existing && existing.key === key && !force) return { status: "done", links: existing };

  const scores = (await listScores(lesson.student_id, { includeArchived: true })).filter((s) => s.sections.length);
  if (!scores.length)
    return {
      status: "nothing",
      error: "Upload the student's music and let Claude find the pieces first.",
    };
  const pieces: Piece[] = scores
    .sort((a, b) => Number(a.archived) - Number(b.archived))
    .flatMap((score) => score.sections.map((section) => ({ score, section })))
    .map((p, i) => ({ ...p, n: i + 1 }));

  let usage: ClaudeUsage[] = [];
  try {
    const s1 = await step1(row.transcript, moments, pieces);
    usage = s1.usage;
    const byMoment = new Map(s1.out.map((o) => [o.moment, o]));
    const requests: BoxRequest[] = [];
    moments.forEach((_, i) => {
      const o = byMoment.get(i + 1);
      const piece = o && pieces.find((p) => p.n === o.piece);
      if (piece && o.bars.trim()) requests.push({ n: i + 1, piece, bars: o.bars.trim() });
    });
    let boxes = new Map<number, BoxAnswer>();
    try {
      const s2 = await step2(requests);
      boxes = s2.boxes;
      usage = [...usage, ...s2.usage];
    } catch (e) {
      console.error("linkLessonMusic boxes", lessonId, e);
    }

    const links: StoredLink[] = moments.map((m, i) => {
      const o = byMoment.get(i + 1);
      const piece = o && pieces.find((p) => p.n === o.piece);
      if (!piece) return { seconds: m.seconds, label: m.label, music: null };
      const s = piece.section;
      const found = boxes.get(i + 1);
      return {
        seconds: m.seconds,
        label: m.label,
        music: {
          scoreId: piece.score.id,
          page: found?.page ?? s.start_page,
          fromPage: s.start_page,
          toPage: s.end_page,
          piece: sectionLabel(s),
          bars: o!.bars.trim(),
          box: found?.box ?? null,
        },
      };
    });
    const result: MusicLinks = {
      key,
      made_at: new Date().toISOString(),
      links,
    };
    // Re-read the draft so a redraft that finished meanwhile isn't undone.
    const fresh = await latestTranscript(db, lessonId);
    const draft = (fresh?.draft && typeof fresh.draft === "object" ? fresh.draft : {}) as Record<string, unknown>;
    await db
      .from("lesson_transcripts")
      .update({ draft: { ...draft, music_links: result } as unknown as Json })
      .eq("id", row.id);
    await logUsage(db, teacherId, row, usage);
    return { status: "done", links: result };
  } catch (e) {
    if (e instanceof LinkError) usage = e.usage;
    await logUsage(db, teacherId, row, usage);
    console.error("linkLessonMusic", lessonId, e);
    const error =
      e instanceof LinkError || e instanceof MissingKeyError
        ? e.message
        : "Matching the clips to the music didn't work. Try again.";
    return { status: "error", error };
  }
}

async function logUsage(
  db: Db,
  teacherId: string,
  row: { lesson_id: string; recording_id: string },
  usage: ClaudeUsage[],
) {
  if (!usage.length) return;
  await db.from("ai_usage").insert(
    usage.map((u) => ({
      teacher_id: teacherId,
      lesson_id: row.lesson_id,
      recording_id: row.recording_id,
      kind: "draft",
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
