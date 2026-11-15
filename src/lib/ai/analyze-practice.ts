import "server-only";
import { anthropicClient, DraftError, lessonModel, usageRows } from "./draft-lesson";
import type { ClaudeUsage } from "./pricing";
import { POINT_TOPICS, type PracticeAnalysis } from "@/lib/practice/review-types";
import { ALL_GRADES, DEFAULT_GRADING, gradesFor, gradingPrompt, type GradingConfig } from "@/lib/grading";
import type { ScaleSummary } from "@/lib/practice/scales";
import { systemWithStyle, type TeachingStyle } from "./teaching-style";

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
  /** "Practicing with someone else?" was ticked: a parent or helper was giving instruction. */
  withHelper?: boolean;
  activity: string;
  transcript: string;
  /** Scales and arpeggios found by code from the notes. */
  scales: ScaleSummary[];
  scalesText: string;
  /** Code's matches against the student's uploaded music; empty when none has notes read. */
  musicText: string;
  /** Code's count of attempts, stops, spot work and tempo per matched piece; empty without uploaded music. */
  methodText: string;
  /** Code's intonation summary; empty for piano or too few held notes. */
  intonationText: string;
  /** The teacher's review tone and teaching profile. */
  style?: TeachingStyle;
  /** Grading system, standard and definitions for this student. */
  grading?: GradingConfig;
  /**
   * What the family was told after the last few practices (newest first), so
   * this review can lead with what changed instead of saying it all again.
   */
  earlierReviews?: { date: string; summary: string; goingWell: string[]; workOn: string[]; methodNote: string }[];
  /** Which practice this is since that lesson: 1 for the first. */
  practiceNumber?: number;
  /** The open points on "What we're working on", most important first. */
  focusItems?: { id: string; title: string; piece: string; status: string }[];
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
    "method_note",
  ],
  properties: {
    counted: { type: "boolean" },
    not_counted_reason: { type: "string" },
    grade: { type: "string", enum: [...ALL_GRADES, ""] },
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
    method_note: { type: "string" },
    changed: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["tag", "text", "focus_id"],
        properties: {
          tag: { type: "string", enum: ["first_time", "better", "same", "went_back", "left"] },
          text: { type: "string" },
          focus_id: { type: "string" },
        },
      },
    },
    focus: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "verdict", "note"],
        properties: {
          id: { type: "string" },
          verdict: { type: "string", enum: ["first_time", "better", "same", "went_back", "not_heard"] },
          note: { type: "string" },
        },
      },
    },
  },
} as const;

const SYSTEM_TEMPLATE = `You review a child's recorded home music practice for their family and their teacher. Most students follow the Suzuki method: a parent supervises daily practice, and the teacher assigns a short list of pieces, review pieces and technique (scales, arpeggios, etudes, bow or hand exercises) each week.

You cannot hear the recording. You get what the phone wrote down while it recorded: one line per second with sound, giving the loudest level (dB below full scale; quieter than -50 dB counts as quiet) and the notes it detected in that second, in order, as note names with octave (C4 is middle C), sometimes with the average distance from the nearest note in cents. Quiet stretches are folded into one line. The pitch detector follows one melody line: chords and piano accompaniment come out as their top or strongest note, and it can briefly jump an octave. You may also get a transcript of anything said aloud (often the parent or child naming what comes next). Long stretches of music can produce garbled words in the transcript; ignore those.

Work out what was practised and when:
- Scales and arpeggios: you may get a list of scales and arpeggios that code found in the notes before you (key, octaves, about how many times, when). Trust it for which keys were played and use it to tick scale and arpeggio assignments (an assignment for "G and D major scales and arpeggios" is practised when those keys were found; say which were and weren't in the note). Counts are approximate. A note outside the key inside a scale (C natural in D major) may be a wrong note or a misreading; mention it gently only if it is listed. The code only finds runs of an octave or more, so short one-octave-or-less warm-ups may be missing from the list; you can still spot those yourself as steady stepwise runs or broken-chord patterns in the timeline.
- Pieces: when you get "Matched by code against the notes of the student's uploaded music", trust strong and good matches for which piece was played, when, and which bars (name the bars in notes and bullets when useful: "bars 9-16 three times"); a possible match needs support from the timeline or speech, and a possible match of only a few bars, away from the rest of that piece's playing, is usually a scale or a warm-up that happens to share notes with it: leave it out rather than name a piece that wasn't played. Otherwise, and for pieces without uploaded music, match the note sequences to the melodies of the assigned pieces and the student's Suzuki books, which you know (for example Twinkle variations, Lightly Row, Minuet 1, Gavotte by Gossec, Hunters' Chorus).
- Speech naming a piece is strong evidence.

How the student practised matters as much as what. Judge the method the way an experienced teacher would:
- Good practice: isolating the hard spot and looping just those few bars, slowing the tempo down on repeats, working on rhythm, then putting the spot back in context and getting through the passage. Earn praise only for this.
- Not good practice: starting again from the top over and over and stopping at the same place (or at different places) each time without ever getting through the passage; or playing straight through again and again at the same tempo without stopping to fix anything. Repetition by itself is not practice. Never praise "going back to the beginning over and over" or "playing it many times": say plainly what happened ("Started Gavotte from the top 6 times and stopped at bar 9 each time; never got through to bar 16") and what to do instead ("Loop bars 8-10 slowly, then play from bar 5 to 12").
- When you get "Practice method measured by code" (attempts per piece from the student's uploaded music), trust its counts, stop bars, spot loops, tempo and verdict; use the bar numbers. It gives one sentence per piece after "Say this, in these words:" on how many times the piece was played from its first bar to its last: use that sentence's numbers as they are whenever you say how many times a piece was played through, and never count an attempt that started partway (bar 17, bar 25) as a time through the piece, even though it reached the last bar. A jump back with no pause can be a written repeat in the music rather than a stop; the code only counts a stop when there was a pause before going back. A stretch ending on a phrase end that no attempt passed may be the passage the teacher assigned; check the assignment's "how". Without that section, judge the method from the timeline as best you can (the same notes starting again and again, how far each time) and say less.
- Playing review pieces through once each is fine; the method judgement is about pieces being learnt or polished.
- When an assignment's "how" names a section (bars 17 to 32, the B section, the last line), judge and comment on that section only: playing just those bars is doing the assignment, not "never reaching the end" or "skipping the start", and bars outside it are a bonus, not a gap.
- A lesson video or other recording may be playing in the room (the family watching the lesson again). Signs: a long stretch of an adult teaching in full lesson sentences with playing that answers them, while the notes show little or no live playing, or the same words as the lesson; and the session was not marked as practice with a helper. Do not review that stretch as live teaching or as the student's practice: label it "Lesson video playing" in the timeline, leave it out of minutes and grade, and say so in teacher_note.
- If the child says something hurts or is tired or sore (hand, arm, shoulder, back, fingers), do not give any technique or posture advice about that part of the body in this review, and do not ask for more repetitions of what hurt. Say in teacher_note, in the child's words, what was said and when.
- Only mark an assignment practiced when the timeline or transcript supports it. confidence is high when the melody or the spoken name clearly matches, medium when it is likely, low when it is a guess. minutes is your estimate of time spent on it (0 if not practised). note is at most six words on what you noticed ("whole piece twice, then the shift"). Include every assignment you are given, by its id. Listening and game assignments usually can't be heard; mark them not practiced with a note that they can be ticked by hand.
- repertoire: one entry for each "current piece" you are given (they are the student's pieces that aren't on the assignment list), by its exact title, with practiced true only when the timeline or transcript supports it, and a note of at most six words.
- other: anything played that is not on the list (older review pieces, improvising), with minutes.
- timeline: the session in order, as stretches start-end in m:ss with a short label ("Warm-up: D major scale", "Gavotte, whole piece", "Talking / break"). Usually 3 to 15 entries.

counted: false only when the session clearly wasn't practice: almost nothing musical, or only a few random notes now and then, or long silence with sound only at the very start and end. A short but real practice counts. Put a one-sentence, non-judgemental reason in not_counted_reason (empty when counted).

<<GRADING>>

Write for the parent and child in a plain, kind, factual voice, as a good teacher talks to a child: never scold, shame or sound suspicious, and never flatter. Praise has to be earned by the evidence: no "great job", "amazing" or "well done" for simply playing, for playing a lot, or for repeating things. These are children and practising at all counts for something, so say what was done, but say honestly how it was done. How warm or firm to be is set by the teacher's review tone at the end of these instructions. Keep everything short: these are a checklist and bullet points, not explanations.
Everything the family reads (summary, encouragement, going_well, work_on, method_note, grade_reason, notes) describes the playing only. Never describe the child's mood, attitude, effort of will, attention or behaviour ("frustrated", "distracted", "silly", "unfocused", "noodling", "not trying", "tired of it"), and never report or comment on what family members said to each other, or how a parent spoke. If something of that kind matters for the teacher, put the plain fact in teacher_note only. When the recording shows a child upset, the family's text says what was played, one thing that was earned, and one small next step, and nothing else.
- summary: 1 to 3 short sentences. When you were given earlier reviews, open with what is different from last time (what was added, dropped, better or worse); otherwise say what was played. Do not repeat anything that is in going_well, work_on, method_note or grade_reason. Plain and warm, no lists.
- encouragement: one short, specific line for the child about something that really was good ("Steady bow on the long notes in Gavotte."). When nothing in the session earned praise, make it a plain, kind nudge toward the one change that matters most instead ("Tomorrow, try the hard bar slowly five times before the whole piece."). About something not already said in going_well. Empty only when the session wasn't counted.
- going_well: up to 4 bullets, each under 10 words, on what really went well, as specific as the evidence allows ("Looped bars 8-10 slowly, then played through", "Steady D major scale, two octaves"). Only what earned it: fewer bullets, even one or none, is better than padding. Restarting from the top many times is never a going_well bullet.
- work_on: zero to three bullets, each under 14 words, on what to work on next. When you were given earlier reviews, include only what is new, changed or worse since them; fewer bullets, even none, is right when nothing new came up. A problem that is the same as in the earlier reviews is not explained again: all unchanged problems share ONE bullet that names each and counts it from the earlier reviews you were given ("E still sharp, 3rd practice running; scales skipped again"). A problem that got worse keeps its count and says so ("E sharper than last time, 3rd practice running"). Count only practices where the earlier review really named that problem; if you cannot count it, say "again". Assignments that were skipped are named together in one bullet, never left out for lack of room. Each bullet is concrete and tied to the assignments and the teacher's focus: intonation on a named note or passage, rushing in a named spot, tempo, tone, a section that keeps stopping, or the practice method itself (restarting from the top and stalling at the same bar, playing through without fixing the hard spot, long breaks, skipping an assignment). When the code's method verdict for a piece is "kept restarting and stopping" or "played the same stretch through again and again", one work_on bullet must say so with the bar and the better way ("Stopped at bar 9 five times: loop bars 8-10 slowly"). Examples: "Intonation on the F# in Gavotte", "Try not to rush bar 12", "Start with the hard spot, slowly". Only claim intonation or rhythm problems the evidence supports; otherwise keep to what you can tell. For intonation, use the "Intonation measured by code" section when you get it: it is measured from the held notes against the instrument's tuning in cents, on a strict scale set for a teacher's ear (within 7 cents in tune, 8-15 slightly off, 16-25 clearly off, beyond 25 out of tune), per scale, per piece and per stretch of playing, with the notes that lean sharp or flat.
  Intonation is the one place where you are not encouraging: be honest and exact, as a strict teacher would be. Use the code's verdict words ("in tune", "mostly in tune", "uneven", "often out of tune") and never soften them. Never call intonation good, nice, solid or steady unless the code's verdict is "in tune". Never put intonation in going_well unless that scale or piece is "in tune". Playing the right notes is not playing in tune: a scale with all the right notes and 50% in tune is an intonation problem, not a success, so "Right notes in D major" can go in going_well only as right notes, never as "in tune". When the whole session or an assigned piece is "uneven" or "often out of tune", at least one work_on bullet must be about intonation, naming the most off notes with their direction and size in cents ("E is about 11 cents sharp in D major", "A on the D string sits sharp, up to 25 cents"), unless the same note was reported in the last review and is still in the same band (in tune, slightly off, clearly off, out of tune): then it goes in the unchanged bullet, with no numbers. A few cents either way inside a band is not a change. Name the scale degree or finger when the code gives it. Mention improvement only when the numbers on the same scale show it.
  When the intonation section is missing (piano, or too few held notes) say nothing about intonation. Without the section, fall back to the per-second cents in the timeline (far from 0 on the same note again and again).
  Each bullet has a topic (intonation, rhythm, tempo, tone, notes, technique, memory, focus, routine or other) and piece: the piece, scale or exercise it is about, or empty.
- method_note: one plain, honest sentence for the family on how the practising was done, with the numbers ("Gavotte: 7 starts from the top, played from the first bar to the last once, stopped at bar 9 five times. Next time loop bars 8-10 slowly first."). Praise the method only when it was good. Kind but factual: no "great job" unless the evidence earns it. Empty when nothing was matched or the session wasn't counted.
- teacher_note: one or two factual sentences for the teacher only (what was and wasn't covered, anything that may need attention). Empty if nothing to add.
- changed: the card the family reads first: what is different about this practice, in at most three lines, each under 14 words and each with one tag. first_time: something done for the first time (a piece reached its last line, a scale played in tune, an assignment never practised before). better: clearly better than the last practice, with the comparison in plain numbers when you have them ("Stopped once in Gavotte's last line. Sunday it stopped five times"). went_back: clearly worse than the last practice. same: a known problem that has not moved, named in a few words with no explanation. left: assigned things not touched today, all named together in ONE line ("Scales, arpeggios, Silent Night"); they are left for tomorrow, never "skipped" or "missed". Most important first, and a line about one of the focus points comes before the rest. Compare only with the earlier reviews you were given; with none, use first_time and left only, or leave the list empty. A few cents of intonation either way inside one band is "same", not better or went_back. Describes the playing only. Do not repeat these lines in summary. focus_id is the id of the focus point the line is about, or empty.
- focus: when you are given "What we're working on", one entry for every point, by its id: what THIS practice showed about it. not_heard when the recording can't show it (posture, arm weight, anything not audible in the notes or named in the speech) or it wasn't practised; never guess. Otherwise first_time, better, same or went_back against the earlier reviews (same when there is nothing to compare with). note: at most twelve words of evidence, empty for not_heard. Empty list when you were given no focus points.`;

/** The fixed instructions with this student's grading rules in place. */
function systemFor(grading: GradingConfig, instrument: string): string {
  return SYSTEM_TEMPLATE.replace("<<GRADING>>", gradingPrompt(grading, instrument));
}

function contextText(c: PracticeContext): string {
  const lines = [
    `Student: ${c.studentName}${c.age ? `, age ${c.age}` : ""}. Instrument: ${c.instrument}. Current book: ${c.currentBook || "not set"}.`,
    `Session length: ${Math.round(c.durationSeconds / 60)} min. Seconds with pitched sound: ${c.playingSeconds}.`,
  ];
  if (c.withHelper)
    lines.push(
      "This was home practice with someone else giving instruction, usually a parent (who may also be a music teacher). It is a practice session, not a lesson: treat any adult voice in the transcript as that helper, never as the student's teacher, and review it as the student's practice. Their instructions show what was worked on and how; credit the work to the practice. What the helper asked for counts as assigned work: playing it is on the list, not off the list. Grade the student's practice as usual otherwise. In teacher_note, say it was practised with a helper and name anything the helper asked for that differs from the assignments.",
    );
  if (c.lessonDate)
    lines.push(
      `These assignments come from the lesson on ${c.lessonDate}.${c.practiceNumber ? ` This is recorded practice number ${c.practiceNumber} since that lesson.` : ""}`,
    );
  if (c.focus) lines.push(`The teacher's focus for this week:\n${c.focus}`);
  if (c.focusItems?.length)
    lines.push(
      `What we're working on (the teacher's short lasting list; id | point | piece | status so far):\n${c.focusItems
        .map((f) => `${f.id} | ${f.title} | ${f.piece} | ${f.status}`)
        .join("\n")}`,
    );
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
  if (c.musicText) lines.push(`Matched by code against the notes of the student's uploaded music:\n${c.musicText}`);
  if (c.methodText) lines.push(`Practice method measured by code:\n${c.methodText}`);
  if (c.intonationText) lines.push(`Intonation measured by code:\n${c.intonationText}`);
  if (c.earlierReviews?.length)
    lines.push(
      `What the family was told after the last ${c.earlierReviews.length === 1 ? "practice" : `${c.earlierReviews.length} practices`}, newest first. They have read these; do not say the same things again:\n${c.earlierReviews
        .map((e) =>
          [
            `${e.date}: ${e.summary}`,
            e.goingWell.length ? `  Going well: ${e.goingWell.join("; ")}` : "",
            e.workOn.length ? `  Work on: ${e.workOn.join("; ")}` : "",
            e.methodNote ? `  How it was practised: ${e.methodNote}` : "",
          ]
            .filter(Boolean)
            .join("\n"),
        )
        .join("\n")}`,
    );
  lines.push(
    c.scalesText
      ? `Scales and arpeggios found by code:\n${c.scalesText}`
      : "Scales and arpeggios found by code: none of an octave or more.",
  );
  return lines.join("\n\n");
}

export async function analyzePractice(ctx: PracticeContext): Promise<{ analysis: PracticeAnalysis; usage: ClaudeUsage[] }> {
  const grading = ctx.grading ?? DEFAULT_GRADING;
  const anthropic = anthropicClient();
  const stream = anthropic.beta.messages.stream({
    model: lessonModel(),
    max_tokens: 32000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
    system: systemWithStyle(systemFor(grading, ctx.instrument), ctx.style, "practice"),
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
    const analysis = JSON.parse(text) as PracticeAnalysis;
    // Keep the grade inside the system this student is graded on.
    if (analysis.grade && !(gradesFor(grading.system) as readonly string[]).includes(analysis.grade)) {
      analysis.grade = "";
      analysis.grade_reason = "";
    }
    analysis.grading = { system: grading.system, standard: grading.standard };
    return { analysis, usage };
  } catch {
    throw new DraftError("Claude's review couldn't be read. Try again.", usage);
  }
}
