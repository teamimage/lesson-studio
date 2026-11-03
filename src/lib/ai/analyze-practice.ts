import "server-only";
import { anthropicClient, DraftError, lessonModel, usageRows } from "./draft-lesson";
import type { ClaudeUsage } from "./pricing";
import { POINT_TOPICS, PRACTICE_GRADES, type PracticeAnalysis } from "@/lib/practice/review-types";
import type { ScaleSummary } from "@/lib/practice/scales";

// Claude reads a home practice session (the sound timeline the phone wrote
// down while recording, plus any talking AssemblyAI transcribed) and works
// out which of the teacher's assignments were practised.

export type { PracticeAnalysis, PracticeItem } from "@/lib/practice/review-types";

export type PracticeContext = {
  studentName: string;
  instrument: string;
  age: number | null;
  currentBook: string | null;
  bookPieces: string[];
  lessonDate: string | null;
  focus: string | null;
  assignments: { id: string; kind: string; title: string; how: string | null }[];
  pieces: { title: string; notes: string | null }[];
  /** Current repertoire not already on the assignment list. */
  currentPieces: string[];
  durationSeconds: number;
  playingSeconds: number;
  activity: string;
  transcript: string;
  /** Scales and arpeggios found by code from the notes. */
  scales: ScaleSummary[];
  scalesText: string;
};

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
  required: [
    "counted",
    "not_counted_reason",
    "grade",
    "grade_reason",
    "summary",
    "items",
    "repertoire",
    "other",
    "timeline",
    "encouragement",
    "going_well",
    "work_on",
    "teacher_note",
  ],
  properties: {
    counted: { type: "boolean" },
    not_counted_reason: { type: "string" },
    grade: { type: "string", enum: [...PRACTICE_GRADES, ""] },
    grade_reason: { type: "string" },
    summary: { type: "string" },
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["assignment_id", "practiced", "confidence", "minutes", "note"],
        properties: {
          assignment_id: { type: "string" },
          practiced: { type: "boolean" },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
          minutes: { type: "number" },
          note: { type: "string" },
        },
      },
    },
    other: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["label", "minutes"],
        properties: { label: { type: "string" }, minutes: { type: "number" } },
      },
    },
    timeline: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["start", "end", "label"],
        properties: { start: { type: "string" }, end: { type: "string" }, label: { type: "string" } },
      },
    },
    repertoire: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "practiced", "note"],
        properties: { title: { type: "string" }, practiced: { type: "boolean" }, note: { type: "string" } },
      },
    },
    encouragement: { type: "string" },
    going_well: { type: "array", items: POINT },
    work_on: { type: "array", items: POINT },
    teacher_note: { type: "string" },
  },
} as const;

const SYSTEM = `You review a child's recorded home music practice for their family and their teacher. Most students follow the Suzuki method: a parent supervises daily practice, and the teacher assigns a short list of pieces, review pieces and technique (scales, arpeggios, etudes, bow or hand exercises) each week.

You cannot hear the recording. You get what the phone wrote down while it recorded: one line per second with sound, giving the loudest level (dB below full scale; quieter than -50 dB counts as quiet) and the notes it detected in that second, in order, as note names with octave (C4 is middle C), sometimes with the average distance from the nearest note in cents. Quiet stretches are folded into one line. The pitch detector follows one melody line: chords and piano accompaniment come out as their top or strongest note, and it can briefly jump an octave. You may also get a transcript of anything said aloud (often the parent or child naming what comes next). Long stretches of music can produce garbled words in the transcript; ignore those.

Work out what was practised and when:
- Scales and arpeggios: you may get a list of scales and arpeggios that code found in the notes before you (key, octaves, about how many times, when). Trust it for which keys were played and use it to tick scale and arpeggio assignments (an assignment for "G and D major scales and arpeggios" is practised when those keys were found; say which were and weren't in the note). Counts are approximate. A note outside the key inside a scale (C natural in D major) may be a wrong note or a misreading; mention it gently only if it is listed. The code only finds runs of an octave or more, so short one-octave-or-less warm-ups may be missing from the list; you can still spot those yourself as steady stepwise runs or broken-chord patterns in the timeline.
- Pieces: match the note sequences to the melodies of the assigned pieces and the student's Suzuki books, which you know (for example Twinkle variations, Lightly Row, Minuet 1, Gavotte by Gossec, Hunters' Chorus). Repeated short fragments of a piece usually mean focused work on one passage, which is good practice.
- Speech naming a piece is strong evidence.
- Only mark an assignment practiced when the timeline or transcript supports it. confidence is high when the melody or the spoken name clearly matches, medium when it is likely, low when it is a guess. minutes is your estimate of time spent on it (0 if not practised). note is at most six words on what you noticed ("whole piece twice, then the shift"). Include every assignment you are given, by its id. Listening and game assignments usually can't be heard; mark them not practiced with a note that they can be ticked by hand.
- repertoire: one entry for each "current piece" you are given (they are the student's pieces that aren't on the assignment list), by its exact title, with practiced true only when the timeline or transcript supports it, and a note of at most six words.
- other: anything played that is not on the list (older review pieces, improvising), with minutes.
- timeline: the session in order, as stretches start-end in m:ss with a short label ("Warm-up: D major scale", "Gavotte, whole piece", "Talking / break"). Usually 3 to 15 entries.

counted: false only when the session clearly wasn't practice: almost nothing musical, or only random noodling, a few notes now and then, or long silence with sound only at the very start and end. A short but real practice counts. Put a one-sentence, non-judgemental reason in not_counted_reason (empty when counted).

grade: a letter grade, A, B, C, D or F, for the quality of the practice in this session (not the child's talent or how hard the music is). Judge how well the time was used, from the evidence:
- Coverage: how many of the assignments and current pieces were worked on, especially the teacher's focus.
- Focused work: repeating a passage or hard spot, slow work, scales before pieces, rather than only playing straight through favourites.
- Time on task: playing time against session length, few long breaks or noodling, and a length that is reasonable for the student's age (a focused 10 to 15 minutes is good practice for a young child).
- Care: steady tempo and intonation where the note data shows it.
A means focused practice that covered most of the list with real work on hard spots. B is good practice with one thing missing (a skipped assignment, little slow work). C is some useful practice but much left out or mostly playing through. D is a little real practice in a lot of wandering. F is reserved for a session that was counted but barely practice. Grade fairly and without inflation, but remember a parent and child will read it. Empty only when the session wasn't counted.
grade_reason: one short, kind sentence (under 15 words) on the main reason for the grade, naming what would raise it when it isn't an A ("Covered everything with careful slow work on the shift." or "Lovely Gavotte; add the D major scale for an A.").

Write for the parent and child in a warm, encouraging, plain voice. Never scold, shame or sound suspicious; the app is a helper, not a monitor. Keep everything short: these are a checklist and bullet points, not explanations.
- summary: a short paragraph of 2 to 4 sentences (at most about five lines on a phone) on what the session covered: what was played, in what order, and anything that stood out. Plain and warm, no lists.
- encouragement: one short, specific, encouraging line for the child ("Lovely steady bow on the long notes in Gavotte!"). Empty only when the session wasn't counted.
- going_well: 3 or 4 bullets, each under 10 words, on what is going well, as specific as the evidence allows ("Played Gavotte all the way through", "Steady D major scale, two octaves"). Fewer only for a very short session.
- work_on: 3 or 4 bullets, each under 10 words, on what to work on next, concrete and tied to the assignments and the teacher's focus: intonation on a named note or passage, rushing in a named spot, tempo, tone, a section that keeps stopping, or the practice routine itself (long breaks, skipping an assignment, noodling between pieces). Examples: "Intonation on the F# in Gavotte", "Try not to rush bar 12", "Start with the hard spot, slowly". Only claim intonation or rhythm problems the note data supports (cents far from 0 on the same note again and again, or the same passage played much faster each time); otherwise keep to what you can tell.
  Each bullet has a topic (intonation, rhythm, tempo, tone, notes, technique, memory, focus, routine or other) and piece: the piece, scale or exercise it is about, or empty.
- teacher_note: one or two factual sentences for the teacher only (what was and wasn't covered, anything that may need attention). Empty if nothing to add.`;

function contextText(c: PracticeContext): string {
  const lines = [
    `Student: ${c.studentName}${c.age ? `, age ${c.age}` : ""}. Instrument: ${c.instrument}. Current book: ${c.currentBook || "not set"}.`,
    `Session length: ${Math.round(c.durationSeconds / 60)} min. Seconds with pitched sound: ${c.playingSeconds}.`,
  ];
  if (c.lessonDate) lines.push(`These assignments come from the lesson on ${c.lessonDate}.`);
  if (c.focus) lines.push(`The teacher's focus for this week:\n${c.focus}`);
  if (c.assignments.length) {
    lines.push(
      `Assignments (id | kind | title | how):\n${c.assignments
        .map((a) => `${a.id} | ${a.kind} | ${a.title} | ${a.how ?? ""}`)
        .join("\n")}`,
    );
  } else {
    lines.push("There is no assignment list yet; describe what was practised.");
  }
  if (c.pieces.length)
    lines.push(`Pieces worked on in that lesson:\n${c.pieces.map((p) => (p.notes ? `${p.title}: ${p.notes}` : p.title)).join("\n")}`);
  if (c.currentPieces.length) lines.push(`Current pieces not on the assignment list:\n${c.currentPieces.join("\n")}`);
  if (c.bookPieces.length) lines.push(`Pieces in the student's books, in order:\n${c.bookPieces.join("\n")}`);
  lines.push(
    c.scalesText
      ? `Scales and arpeggios found by code:\n${c.scalesText}`
      : "Scales and arpeggios found by code: none of an octave or more.",
  );
  return lines.join("\n\n");
}

export async function analyzePractice(ctx: PracticeContext): Promise<{ analysis: PracticeAnalysis; usage: ClaudeUsage[] }> {
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
        content:
          `${contextText(ctx)}\n\n<sound_timeline>\n${ctx.activity || "(no sound recorded)"}\n</sound_timeline>\n\n` +
          `<speech_transcript>\n${ctx.transcript || "(no speech transcribed)"}\n</speech_transcript>\n\nReview this practice session.`,
      },
    ],
  });
  const message = await stream.finalMessage();
  const usage = usageRows(message);
  if (message.stop_reason === "refusal") throw new DraftError("Claude declined to review this practice.", usage);
  if (message.stop_reason === "max_tokens") throw new DraftError("The review came out too long. Try again.", usage);
  const text = message.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  try {
    return { analysis: JSON.parse(text) as PracticeAnalysis, usage };
  } catch {
    throw new DraftError("Claude's review couldn't be read. Try again.", usage);
  }
}
