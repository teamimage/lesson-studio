import "server-only";
import { anthropicClient, DraftError, lessonModel, usageRows } from "./draft-lesson";
import type { ClaudeUsage } from "./pricing";
import { systemWithStyle, type TeachingStyle } from "./teaching-style";
import { POINT_TOPICS, type PeriodReview } from "@/lib/practice/review-types";

// Claude writes the short part of a practice review covering the time from
// one lesson to the next, from that period's numbers and the session reviews
// already written. No audio is involved, so
// this is a small, cheap call.

const POINT = {
  type: "object",
  additionalProperties: false,
  required: ["text", "topic", "piece"],
  properties: {
    text: { type: "string" },
    topic: { type: "string", enum: [...POINT_TOPICS] },
    piece: { type: "string" },
  },
} as const;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "encouragement", "going_well", "work_on", "trends", "teacher_note"],
  properties: {
    summary: { type: "string" },
    encouragement: { type: "string" },
    going_well: { type: "array", items: POINT },
    work_on: { type: "array", items: POINT },
    trends: { type: "array", items: { type: "string" } },
    teacher_note: { type: "string" },
  },
} as const;

const SYSTEM = `You write a child's music practice review for their family and their teacher. It covers the time between one lesson and the next, which may be one week, two weeks or another length; never call it a week unless it is exactly seven days. Most students follow the Suzuki method: a parent supervises daily practice and the teacher assigns pieces, review pieces and technique at each lesson.

You get the period's numbers (days practised, minutes, which assignments were ticked on which days), the reviews already written for each recorded practice session (a summary, what went well, what to work on), any notes the parent wrote, and the previous period's numbers and "work on" points for comparison.

Write in a plain, kind, factual voice; how warm or firm is set by the teacher's review tone at the end of these instructions. Never scold, shame or sound suspicious, and never flatter: praise must be earned by the evidence. How the student practised matters as much as how much: when the sessions show restarting from the top and stalling at the same bar, or only playing through without fixing hard spots, say so plainly with the numbers and give the better way (loop the spot slowly, then play through); praise method only when it was good (slowed down, isolated the spot, then got through). Keep it short: bullet points, not explanations.
- summary: one or two short sentences on what the period covered.
- encouragement: one short, specific line for the child about something that really was good, or, when nothing earned praise, a kind nudge toward the one change that matters most.
- going_well: up to 4 bullets (fewer is better than padding), each under 10 words, on what went well across the period. Prefer things that came up more than once.
- work_on: 3 or 4 bullets, each under 10 words, for the time until the next lesson, concrete and tied to the assignments ("Intonation on the F# in Gavotte", "Try not to rush bar 12", "Practise the Minuet on more days"). Merge repeats from the session reviews into one bullet. Each bullet has a topic (intonation, rhythm, tempo, tone, notes, technique, memory, focus, routine or other) and piece (or empty).
- trends: up to 3 short lines comparing with the previous period or across this one ("10 of 14 days, up from 4 of 7", "Gavotte got steadier over the two weeks", "Still working on the F#"). Only what the data supports. Empty if there is nothing to compare.
- teacher_note: one or two factual sentences for the teacher only (assignments not touched, anything that may need attention in the next lesson). Empty if nothing to add.

Intonation is the exception to the warm voice: report it honestly and exactly, as a strict teacher would. The session lines carry code-measured intonation on a strict cents scale (within 7 cents in tune, beyond 25 out of tune) with verdict words; use those words, never call intonation good unless the verdict is "in tune", never count right notes as in tune, and when intonation is "uneven" or "often out of tune" make one work_on bullet about it, naming the notes that lean and which way. Older sessions graded on the old lenient scale (marked "old scale") don't count as evidence of good intonation.

If the next lesson hasn't happened yet, write about the period so far.`;

export async function analyzePeriod(input: string, style?: TeachingStyle): Promise<{ review: PeriodReview; usage: ClaudeUsage[] }> {
  const anthropic = anthropicClient();
  const stream = anthropic.beta.messages.stream({
    model: lessonModel(),
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
    system: systemWithStyle(SYSTEM, style, "period"),
    messages: [{ role: "user", content: `${input}\n\nWrite the practice review.` }],
  });
  const message = await stream.finalMessage();
  const usage = usageRows(message);
  if (message.stop_reason === "refusal") throw new DraftError("Claude declined to write this practice review.", usage);
  if (message.stop_reason === "max_tokens") throw new DraftError("The practice review came out too long. Try again.", usage);
  const text = message.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  try {
    return { review: JSON.parse(text) as PeriodReview, usage };
  } catch {
    throw new DraftError("Claude's practice review couldn't be read. Try again.", usage);
  }
}
