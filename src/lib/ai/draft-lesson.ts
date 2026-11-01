import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { Constants, type Enums } from "@/lib/supabase/types";
import type { ClaudeUsage } from "./pricing";
import { MissingKeyError } from "./assemblyai";

// Claude reads the lesson transcript and drafts the lesson record. The model
// can be changed with the LESSON_AI_MODEL env var (e.g. claude-fable-5-1 for
// the most capable model, or claude-sonnet-5-5 to save money).
export const DEFAULT_MODEL = "claude-opus-5-5";

export type DraftPiece = { title: string; activity: Enums<"piece_activity">; notes: string };
export type DraftAssignment = {
  kind: Enums<"assignment_kind">;
  title: string;
  how: string;
  every_day: boolean;
  /** Where in the video it was worked on, "m:ss" (or "" if nowhere). */
  video_time?: string;
};
/** A moment in the video worth jumping back to, "m:ss" from the start. */
export type DraftMoment = { time: string; label: string };
export type LessonDraft = {
  summary: string;
  focus_points: string;
  parent_message: string;
  suggestions: string;
  teacher_notes: string;
  pieces: DraftPiece[];
  assignments: DraftAssignment[];
  moments?: DraftMoment[];
};

export type DraftContext = {
  studentName: string;
  instrument: string;
  age: number | null;
  currentBook: string | null;
  lessonDate: string;
  bookPieces: string[];
  repertoire: { title: string; status: string }[];
  lastLesson: { date: string; summary: string | null; assignments: string[] } | null;
  transcript: string;
};

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "focus_points", "parent_message", "suggestions", "teacher_notes", "pieces", "assignments", "moments"],
  properties: {
    summary: { type: "string" },
    focus_points: { type: "string" },
    parent_message: { type: "string" },
    suggestions: { type: "string" },
    teacher_notes: { type: "string" },
    pieces: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "activity", "notes"],
        properties: {
          title: { type: "string" },
          activity: { type: "string", enum: [...Constants.public.Enums.piece_activity] },
          notes: { type: "string" },
        },
      },
    },
    assignments: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "title", "how", "every_day", "video_time"],
        properties: {
          kind: { type: "string", enum: [...Constants.public.Enums.assignment_kind] },
          title: { type: "string" },
          how: { type: "string" },
          every_day: { type: "boolean" },
          video_time: { type: "string" },
        },
      },
    },
    moments: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["time", "label"],
        properties: {
          time: { type: "string" },
          label: { type: "string" },
        },
      },
    },
  },
} as const;

const SYSTEM = `You help a private music teacher turn a recorded lesson into the written lesson record. The teacher reads and edits your draft before anything reaches the family.

The input is a machine transcript of a lesson video. Speakers are labelled A, B, C in order of first appearance; work out from context who is the teacher, the student and any parent. Long stretches of playing produce no words or garbled words; skip them. Timestamps are minutes:seconds from the start of the video.

Most students follow the Suzuki method, where a parent supervises daily home practice. Write for that parent: warm, concrete, plain words, no jargon they would not know.

Fill the fields like this:
- summary: "Today we..." in 2-4 sentences. What was worked on, in lesson order.
- focus_points: the one to three teaching points that matter most this week, each on its own line.
- pieces: every piece played or discussed. Use the exact title from the student's book list when it matches. activity is started (first time), worked_on, polished, reviewed (older piece), or performed. notes: a short phrase on what was worked on.
- assignments: the home practice the teacher asked for, or that clearly follows from the lesson. Keep them short: they show as one-line rows that open on a tap. title is at most six words and names the piece, passage or exercise ("Perpetual Motion: shifts"). how is one or two short sentences on how to practise it (tempo, repetitions, what to listen or watch for). Use kind piece, review, technique, listening, game, theory or other. every_day is true unless it is an occasional task. video_time is the timestamp (m:ss, as in the transcript) where the teacher demonstrated or worked on it, so the family can watch that spot; "" if there is none.
- parent_message: one or two friendly sentences to the parent, for the printed sheet.
- suggestions: teacher-only ideas for next lesson.
- teacher_notes: teacher-only. Observations on posture, tone, attention and progress.
- moments: the lesson's timeline, so the teacher can jump to each part of the video: every change of piece or activity and every important teaching point, in order. time is m:ss from the transcript; label is a few words ("Perpetual Motion, shifting"). Usually 6 to 20 entries.

Only include what the transcript supports; leave a field empty rather than invent. Keep it short enough to fit a one-page sheet.`;

export function anthropicClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) throw new MissingKeyError("ANTHROPIC_API_KEY isn't set in Vercel yet.");
  return new Anthropic();
}

export function lessonModel(): string {
  return process.env.LESSON_AI_MODEL?.trim() || DEFAULT_MODEL;
}

function contextText(c: DraftContext): string {
  const lines = [
    `Student: ${c.studentName}${c.age ? `, age ${c.age}` : ""}. Instrument: ${c.instrument}.`,
    `Current book: ${c.currentBook || "not set"}.`,
    `Lesson date: ${c.lessonDate}.`,
  ];
  if (c.bookPieces.length) lines.push(`Pieces in the student's books, in order:\n${c.bookPieces.join("\n")}`);
  if (c.repertoire.length)
    lines.push(`Student's repertoire list:\n${c.repertoire.map((r) => `${r.title} (${r.status})`).join("\n")}`);
  if (c.lastLesson) {
    lines.push(
      `Previous lesson (${c.lastLesson.date}): ${c.lastLesson.summary || "no summary"}` +
        (c.lastLesson.assignments.length ? `\nIts assignments:\n${c.lastLesson.assignments.join("\n")}` : ""),
    );
  }
  return lines.join("\n\n");
}

export async function draftLesson(ctx: DraftContext): Promise<{ draft: LessonDraft; usage: ClaudeUsage[] }> {
  const anthropic = anthropicClient();
  const stream = anthropic.beta.messages.stream({
    model: lessonModel(),
    max_tokens: 32000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: `${contextText(ctx)}\n\n<transcript>\n${ctx.transcript}\n</transcript>\n\nDraft the lesson record.`,
      },
    ],
  });
  const message = await stream.finalMessage();
  const usage = usageRows(message);

  if (message.stop_reason === "refusal") throw new DraftError("Claude declined to draft this lesson.", usage);
  if (message.stop_reason === "max_tokens") throw new DraftError("The draft came out too long. Try again.", usage);
  const text = message.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  let draft: LessonDraft;
  try {
    draft = JSON.parse(text) as LessonDraft;
  } catch {
    throw new DraftError("Claude's draft couldn't be read. Try again.", usage);
  }
  return { draft, usage };
}

export class DraftError extends Error {
  constructor(
    message: string,
    public usage: ClaudeUsage[],
  ) {
    super(message);
  }
}

// One usage row per model that ran (a refused request that fell back to
// another model bills both).
export function usageRows(message: Anthropic.Beta.BetaMessage): ClaudeUsage[] {
  const u = message.usage;
  const iterations = (u.iterations ?? []).filter(
    (it): it is Extract<typeof it, { type: "message" | "fallback_message" }> =>
      it.type === "message" || it.type === "fallback_message",
  );
  if (iterations.length > 1) {
    return iterations.map((it) => ({
      model: it.model ?? message.model,
      input_tokens: it.input_tokens,
      output_tokens: it.output_tokens,
      cache_read_tokens: it.cache_read_input_tokens ?? 0,
      cache_write_tokens: it.cache_creation_input_tokens ?? 0,
    }));
  }
  return [
    {
      model: message.model,
      input_tokens: u.input_tokens,
      output_tokens: u.output_tokens,
      cache_read_tokens: u.cache_read_input_tokens ?? 0,
      cache_write_tokens: u.cache_creation_input_tokens ?? 0,
    },
  ];
}
