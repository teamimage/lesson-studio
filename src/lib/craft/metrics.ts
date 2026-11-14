// Teaching habits counted from a lesson transcript (the "[12:03] B: words"
// text made by src/lib/ai/assemblyai.ts). Only what the words can show:
// silences and playing time can't be measured yet, because counting and
// cueing while the student plays fills the gaps (checked on real lessons,
// Nov 2026). Word-based counts depend on the word lists below, so they are
// shown as trends, never as exact figures.
//
// The teacher is taken to be the speaker with the most words. In a Suzuki
// lesson a parent may speak too; they count as "not the teacher".

export type LessonHabits = {
  /** Words spoken by everyone. */
  words: number;
  /** Teacher's share of all words, 0–1. */
  teacherShare: number | null;
  /** Questions the teacher asked. */
  questions: number;
  /** Teacher sentences with praise in them. */
  praise: number;
  /** Of those, how many were praise words only ("Good." "Very nice."). */
  barePraise: number;
  /** barePraise / praise, 0–1; null when there were too few to say. */
  barePraiseShare: number | null;
};

const LINE = /^\[[\d:–-]+\]\s*([A-Z]{1,2}):\s*(.*)$/;

const PRAISE = new Set([
  "good", "great", "nice", "beautiful", "beautifully", "excellent", "lovely", "perfect", "wonderful",
  "awesome", "fantastic", "brilliant", "terrific", "super", "bravo", "yay", "amazing", "better",
]);

// Words that can sit around a praise word without saying what was good.
const FILLER = new Set([
  "very", "really", "so", "good", "great", "nice", "beautiful", "beautifully", "excellent", "lovely",
  "perfect", "wonderful", "awesome", "fantastic", "brilliant", "terrific", "super", "bravo", "yay",
  "amazing", "better", "job", "work", "that", "that's", "thats", "was", "is", "it", "yes", "yeah", "ok",
  "okay", "oh", "wow", "um", "uh", "much", "a", "lot", "the", "way", "to", "go", "you", "well", "done",
  "all", "right", "alright", "there", "we",
]);

const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/[’]/g, "'")
    .split(/[^a-z']+/)
    .filter(Boolean);

/** Minimum praise sentences before a share means anything. */
export const MIN_PRAISE = 5;

export function lessonHabits(transcript: string | null | undefined): LessonHabits | null {
  if (!transcript) return null;
  const bySpeaker = new Map<string, string[]>();
  for (const raw of transcript.split("\n")) {
    const m = LINE.exec(raw.trim());
    if (!m) continue;
    const list = bySpeaker.get(m[1]) ?? [];
    list.push(m[2]);
    bySpeaker.set(m[1], list);
  }
  if (!bySpeaker.size) return null;

  let total = 0;
  let teacher: { lines: string[]; count: number } | null = null;
  for (const lines of bySpeaker.values()) {
    const count = lines.reduce((n, l) => n + words(l).length, 0);
    total += count;
    if (!teacher || count > teacher.count) teacher = { lines, count };
  }
  if (!teacher || total === 0) return null;

  const text = teacher.lines.join(" ");
  const questions = (text.match(/\?/g) ?? []).length;
  let praise = 0;
  let bare = 0;
  for (const sentence of text.match(/[^.?!]+[.?!]*/g) ?? []) {
    // A question ("Better?") is asking, not praising.
    if (sentence.trim().endsWith("?")) continue;
    const w = words(sentence);
    if (!w.some((x) => PRAISE.has(x))) continue;
    // "Better" alone is often a request ("make it better"); count it only
    // as praise in short sentences.
    if (w.length > 4 && !w.some((x) => PRAISE.has(x) && x !== "better")) continue;
    praise++;
    if (w.every((x) => FILLER.has(x))) bare++;
  }

  return {
    words: total,
    teacherShare: bySpeaker.size > 1 ? teacher.count / total : null,
    questions,
    praise,
    barePraise: bare,
    barePraiseShare: praise >= MIN_PRAISE ? bare / praise : null,
  };
}

/** The number a program tracks, for one lesson. */
export function habitValue(h: LessonHabits, metric: "barePraise" | "teacherShare" | "questions"): number | null {
  if (metric === "barePraise") return h.barePraiseShare;
  if (metric === "teacherShare") return h.teacherShare;
  return h.questions;
}

export const average = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
