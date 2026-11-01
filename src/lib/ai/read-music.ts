import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { SCORES_BUCKET } from "@/lib/constants";
import { booksFor } from "@/lib/suzuki";
import { parsePages } from "@/lib/stand-timeline";
import { parseAnalysis, type AnalysisStatus, type ScoreAnalysis } from "@/lib/score-analysis";
import type { Json } from "@/lib/supabase/types";
import { MissingKeyError } from "./assemblyai";
import { anthropicClient, DEFAULT_MODEL, usageRows } from "./draft-lesson";
import { claudeCost, type ClaudeUsage } from "./pricing";

// Uploaded sheet music → Claude looks at every page and works out what it is
// (book, edition), where each piece and movement starts and ends, and how
// each piece fits the student (working on now, learned, coming up).
//
// Pages go to Claude as signed image links, so a 60-page book doesn't have to
// pass through this server. The model can be changed with MUSIC_AI_MODEL.

type Db = Awaited<ReturnType<typeof createClient>>;

// Claude takes at most 100 images in one request.
const MAX_PAGES = 100;
// A run that hasn't finished by now died with its function.
const STALE_MS = 6 * 60 * 1000;
const LINK_SECONDS = 60 * 60;

export function musicModel(): string {
  return process.env.MUSIC_AI_MODEL?.trim() || DEFAULT_MODEL;
}

const SECTION = {
  type: "object",
  additionalProperties: false,
  required: ["title", "composer", "movement", "start_page", "end_page", "book_piece", "repertoire_title", "status"],
  properties: {
    title: { type: "string" },
    composer: { type: "string" },
    movement: { type: "string" },
    start_page: { type: "integer" },
    end_page: { type: "integer" },
    book_piece: { type: "string" },
    repertoire_title: { type: "string" },
    status: { type: "string", enum: ["current", "learned", "upcoming", "other"] },
  },
} as const;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "book", "edition", "instrument", "kind", "fit", "sections"],
  properties: {
    title: { type: "string" },
    book: { type: "string" },
    edition: { type: "string" },
    instrument: { type: "string" },
    kind: { type: "string", enum: ["book", "piece", "exercise", "scale", "etude", "other"] },
    fit: { type: "string" },
    sections: { type: "array", items: SECTION },
  },
} as const;

const SYSTEM = `You help a private music teacher organise sheet music they have uploaded for one student: their own copy of a book, a single piece, exercises or scales. You see each page of the upload as an image, labelled with its page number in the upload (not the number printed on the page).

Work out:
- title: a short name for the whole upload as the teacher would say it, e.g. "Suzuki Cello Book 3", "Minuet in G (Bach)", "Two-octave scales". For a Suzuki book use the form "Suzuki <Instrument> Book <n>".
- book: the full book name if it is a published book or volume (e.g. "Suzuki Cello School, Volume 3"), else "".
- edition: publisher and edition or year if printed (e.g. "Alfred, revised edition, 2003"), else "".
- instrument: the instrument it is written for, lower case.
- kind: book (a whole book or several pieces), piece, exercise, scale, etude, or other.
- sections: every piece in the upload, in order. A multi-movement work gets one section per movement, with the work in title and the movement in movement ("I. Allegro"). Exercises, scales and études printed between pieces get their own section too. start_page and end_page are upload page numbers, inclusive. Leave out covers, contents, forewords, notes and blank pages. For each section:
  - composer: as printed, surname only if that is how it is printed; "" if none.
  - book_piece: the exact title from the student's Suzuki book list below if this is that piece, else "".
  - repertoire_title: the exact title from the student's repertoire list below if this is that piece, else "".
  - status: "current" if the student is working on it now (repertoire status learning or polishing, or in recent lessons as started/worked on/polished); "learned" if it is in the repertoire as review or performed, or comes earlier in the book than what they are working on; "upcoming" if it is in their current book or the next one and not yet started; "other" otherwise.
- fit: one or two plain sentences for the teacher on how this music fits the student right now, e.g. "This is the next book after James's current Book 2. He hasn't started any of these pieces yet." Name the piece they are working on now if it is in here.

Only use titles from the lists when they really are the same piece. Read titles from the pages; if a page is unclear, give your best reading rather than leaving it out.`;

export type MusicContext = {
  studentName: string;
  instrument: string;
  currentBook: string | null;
  books: { book: string; pieces: string[] }[];
  repertoire: { title: string; status: string }[];
  recentPieces: { date: string; title: string; activity: string }[];
};

function contextText(c: MusicContext): string {
  const lines = [
    `Student: ${c.studentName}. Instrument: ${c.instrument}. Current book: ${c.currentBook || "not set"}.`,
  ];
  if (c.books.length)
    lines.push(
      `Student's Suzuki book list:\n${c.books.map((b) => `${b.book}:\n${b.pieces.map((p) => `- ${p}`).join("\n")}`).join("\n")}`,
    );
  lines.push(
    c.repertoire.length
      ? `Student's repertoire list (title, status):\n${c.repertoire.map((r) => `- ${r.title} (${r.status})`).join("\n")}`
      : "Student's repertoire list is empty.",
  );
  if (c.recentPieces.length)
    lines.push(
      `Pieces in recent lessons:\n${c.recentPieces.map((p) => `- ${p.date}: ${p.title} (${p.activity})`).join("\n")}`,
    );
  return lines.join("\n\n");
}

async function musicContext(db: Db, studentId: string): Promise<MusicContext> {
  const [{ data: student }, { data: rep }, { data: lessons }] = await Promise.all([
    db.from("students").select("name, instrument, current_book").eq("id", studentId).single(),
    db.from("repertoire").select("title, status").eq("student_id", studentId).order("started_on"),
    db
      .from("lessons")
      .select("lesson_date, lesson_pieces(title, activity)")
      .eq("student_id", studentId)
      .order("lesson_date", { ascending: false })
      .limit(4),
  ]);
  if (!student) throw new Error("That student wasn't found.");
  return {
    studentName: student.name,
    instrument: student.instrument,
    currentBook: student.current_book,
    books: booksFor(student.instrument),
    repertoire: rep ?? [],
    recentPieces: (lessons ?? []).flatMap((l) =>
      l.lesson_pieces.map((p) => ({ date: l.lesson_date, title: p.title, activity: p.activity })),
    ),
  };
}

class ReadError extends Error {
  constructor(
    message: string,
    public usage: ClaudeUsage[] = [],
  ) {
    super(message);
  }
}

async function askClaude(
  ctx: MusicContext,
  urls: string[],
  fileName: string | null,
  pagesTotal: number,
): Promise<{ analysis: ScoreAnalysis; usage: ClaudeUsage[] }> {
  const anthropic = anthropicClient();
  const content: Anthropic.Beta.BetaContentBlockParam[] = [
    {
      type: "text",
      text:
        `${contextText(ctx)}\n\nUploaded file: ${fileName || "photos"}, ${pagesTotal} page${pagesTotal === 1 ? "" : "s"}` +
        (urls.length < pagesTotal ? ` (only the first ${urls.length} are shown).` : "."),
    },
  ];
  urls.forEach((url, i) => {
    content.push({ type: "text", text: `Page ${i + 1}:` });
    content.push({ type: "image", source: { type: "url", url } });
  });
  content.push({ type: "text", text: "Identify this music and list its pieces and movements." });

  const stream = anthropic.beta.messages.stream({
    model: musicModel(),
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
    system: SYSTEM,
    messages: [{ role: "user", content }],
  });
  const message = await stream.finalMessage();
  const usage = usageRows(message);
  if (message.stop_reason === "refusal") throw new ReadError("Claude declined to read this music.", usage);
  if (message.stop_reason === "max_tokens") throw new ReadError("The answer came out too long. Try again.", usage);
  const text = message.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ReadError("Claude's answer couldn't be read. Try again.", usage);
  }
  const analysis = parseAnalysis({ ...(raw as object), pages_read: urls.length, pages_total: pagesTotal } as Json);
  if (!analysis) throw new ReadError("Claude's answer couldn't be read. Try again.", usage);
  return { analysis: tidy(analysis, ctx), usage };
}

// Keep only list titles that really exist, and page numbers inside the upload.
function tidy(a: ScoreAnalysis, ctx: MusicContext): ScoreAnalysis {
  const bookTitles = new Map(ctx.books.flatMap((b) => b.pieces).map((t) => [t.toLowerCase(), t]));
  const repTitles = new Map(ctx.repertoire.map((r) => [r.title.toLowerCase(), r.title]));
  const last = Math.max(1, a.pages_read);
  return {
    ...a,
    sections: a.sections
      .filter((s) => s.start_page <= last)
      .map((s) => ({
        ...s,
        end_page: Math.min(s.end_page, last),
        book_piece: bookTitles.get(s.book_piece.toLowerCase()) ?? "",
        repertoire_title: repTitles.get(s.repertoire_title.toLowerCase()) ?? "",
      })),
  };
}

const KINDS = new Set(["book", "piece", "exercise", "scale", "etude", "other"]);

export type ReadResult = { status: AnalysisStatus; error?: string | null };

/**
 * Reads one score with Claude and saves what it found. Only one run at a time
 * per score (the status flips to 'running' with a conditional update).
 */
export async function readScore(teacherId: string, scoreId: string): Promise<ReadResult> {
  const db = await createClient();
  const { data: score } = await db.from("scores").select("*").eq("id", scoreId).maybeSingle();
  if (!score) return { status: "error", error: "That music wasn't found." };
  const pages = parsePages(score.pages);
  if (pages.length === 0) return { status: "error", error: "The pages haven't finished uploading." };

  const staleBefore = new Date(Date.now() - STALE_MS).toISOString();
  const runningStale = score.analysis_status === "running" && (score.analysis_at ?? "") < staleBefore;
  if (score.analysis_status === "running" && !runningStale) return { status: "running" };

  const startedAt = new Date().toISOString();
  const { data: claimed } = await db
    .from("scores")
    .update({ analysis_status: "running", analysis_error: null, analysis_at: startedAt })
    .eq("id", scoreId)
    .eq("analysis_status", score.analysis_status)
    .select("id")
    .maybeSingle();
  if (!claimed) return { status: "running" };

  let usage: ClaudeUsage[] = [];
  try {
    const shown = pages.slice(0, MAX_PAGES);
    const { data: signed } = await db.storage.from(SCORES_BUCKET).createSignedUrls(
      shown.map((p) => p.path),
      LINK_SECONDS,
    );
    const urls = shown.map((p) => signed?.find((s) => s.path === p.path)?.signedUrl ?? null);
    if (urls.some((u) => !u)) throw new ReadError("Couldn't open the page images. Try again.");
    const ctx = await musicContext(db, score.student_id);
    const out = await askClaude(ctx, urls as string[], score.source_name, pages.length);
    usage = out.usage;
    const a = out.analysis;

    const update: {
      analysis: Json;
      analysis_status: string;
      analysis_error: null;
      analysis_at: string;
      title?: string;
      kind?: string;
      repertoire_id?: string | null;
    } = {
      analysis: a as unknown as Json,
      analysis_status: "done",
      analysis_error: null,
      analysis_at: new Date().toISOString(),
    };
    if (score.title_auto && a.title) update.title = a.title.slice(0, 120);
    if (KINDS.has(a.kind)) update.kind = a.kind;
    // A single piece links to its repertoire entry, like a hand-named one does.
    const only = a.sections.length === 1 ? a.sections[0].repertoire_title : "";
    if (only && !score.repertoire_id) {
      const { data: rep } = await db
        .from("repertoire")
        .select("id")
        .eq("student_id", score.student_id)
        .eq("title", only)
        .limit(1)
        .maybeSingle();
      if (rep) update.repertoire_id = rep.id;
    }
    await db.from("scores").update(update).eq("id", scoreId).eq("analysis_at", startedAt);
    await logUsage(db, teacherId, scoreId, usage);
    return { status: "done" };
  } catch (e) {
    if (e instanceof ReadError) usage = e.usage;
    await logUsage(db, teacherId, scoreId, usage);
    const error =
      e instanceof ReadError || e instanceof MissingKeyError
        ? e.message
        : "Reading the music didn't work. Press Read again to retry.";
    console.error("readScore", scoreId, e);
    await db
      .from("scores")
      .update({ analysis_status: "error", analysis_error: error, analysis_at: new Date().toISOString() })
      .eq("id", scoreId)
      .eq("analysis_at", startedAt);
    return { status: "error", error };
  }
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
