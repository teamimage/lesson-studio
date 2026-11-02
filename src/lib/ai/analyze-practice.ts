import "server-only";
import { anthropicClient, DraftError, lessonModel, usageRows } from "./draft-lesson";
import type { ClaudeUsage } from "./pricing";

// Claude reads a home practice session (the sound timeline the phone wrote
// down while recording, plus any talking AssemblyAI transcribed) and works
// out which of the teacher's assignments were practised.

export type PracticeItem = {
  assignment_id: string;
  practiced: boolean;
  confidence: "high" | "medium" | "low";
  minutes: number;
  note: string;
};
export type PracticeAnalysis = {
  counted: boolean;
  not_counted_reason: string;
  summary: string;
  items: PracticeItem[];
  other: { label: string; minutes: number }[];
  timeline: { start: string; end: string; label: string }[];
  flow: string;
  tips: string[];
  teacher_note: string;
};

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
  durationSeconds: number;
  playingSeconds: number;
  activity: string;
  transcript: string;
};

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["counted", "not_counted_reason", "summary", "items", "other", "timeline", "flow", "tips", "teacher_note"],
  properties: {
    counted: { type: "boolean" },
    not_counted_reason: { type: "string" },
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
    flow: { type: "string" },
    tips: { type: "array", items: { type: "string" } },
    teacher_note: { type: "string" },
  },
} as const;

const SYSTEM = `You review a child's recorded home music practice for their family and their teacher. Most students follow the Suzuki method: a parent supervises daily practice, and the teacher assigns a short list of pieces, review pieces and technique (scales, arpeggios, etudes, bow or hand exercises) each week.

You cannot hear the recording. You get what the phone wrote down while it recorded: one line per second with sound, giving the loudest level (dB below full scale; quieter than -50 dB counts as quiet) and the notes it detected in that second, in order, as note names with octave (C4 is middle C), sometimes with the average distance from the nearest note in cents. Quiet stretches are folded into one line. The pitch detector follows one melody line: chords and piano accompaniment come out as their top or strongest note, and it can briefly jump an octave. You may also get a transcript of anything said aloud (often the parent or child naming what comes next). Long stretches of music can produce garbled words in the transcript; ignore those.

Work out what was practised and when:
- Scales and arpeggios show as steady stepwise runs or broken-chord patterns up and down, often repeated. Name the key when you can.
- Pieces: match the note sequences to the melodies of the assigned pieces and the student's Suzuki books, which you know (for example Twinkle variations, Lightly Row, Minuet 1, Gavotte by Gossec, Hunters' Chorus). Repeated short fragments of a piece usually mean focused work on one passage, which is good practice.
- Speech naming a piece is strong evidence.
- Only mark an assignment practiced when the timeline or transcript supports it. confidence is high when the melody or the spoken name clearly matches, medium when it is likely, low when it is a guess. minutes is your estimate of time spent on it (0 if not practised). note is a few words on what you noticed ("whole piece twice, then bars with the shift"). Include every assignment you are given, by its id. Listening and game assignments usually can't be heard; mark them not practiced with a note that they can be ticked by hand.
- other: anything played that is not on the list (older review pieces, improvising), with minutes.
- timeline: the session in order, as stretches start-end in m:ss with a short label ("Warm-up: D major scale", "Gavotte, whole piece", "Talking / break"). Usually 3 to 15 entries.

counted: false only when the session clearly wasn't practice: almost nothing musical, or only random noodling, a few notes now and then, or long silence with sound only at the very start and end. A short but real practice counts. Put a one-sentence, non-judgemental reason in not_counted_reason (empty when counted).

Write for the parent and child in a warm, encouraging, plain voice. Never scold, shame or sound suspicious; the app is a helper, not a monitor.
- summary: one or two sentences on what the session covered.
- flow: one to three gentle sentences about the shape of the practice: long breaks, a lot of time on one thing and none on another, playing through without stopping to fix spots, or noodling between pieces. Frame it as a friendly idea for next time. If the practice flowed well, say so.
- tips: up to three short, concrete suggestions for the next practice, tied to the teacher's assignments and instructions (for example "Start with the Gavotte shift slowly, three times right"). Empty if nothing useful to add.
- teacher_note: one or two factual sentences for the teacher only (what was and wasn't covered, anything that may need attention, such as notes that look consistently sharp or flat on a passage). Empty if nothing to add.`;

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
  if (c.bookPieces.length) lines.push(`Pieces in the student's books, in order:\n${c.bookPieces.join("\n")}`);
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
