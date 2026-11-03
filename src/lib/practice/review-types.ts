// Shapes of the AI practice reviews, shared by the server code that writes
// them and the pages that show them.

/**
 * What a "going well" or "work on" bullet is about. Kept as data so later
 * checks (scale recognition, intonation scoring) can add their own bullets
 * and the lesson-to-lesson review can spot the same topic coming up again.
 */
export const POINT_TOPICS = [
  "intonation",
  "rhythm",
  "tempo",
  "tone",
  "notes",
  "technique",
  "memory",
  "focus",
  "routine",
  "other",
] as const;
export type PointTopic = (typeof POINT_TOPICS)[number];

export type ReviewPoint = {
  text: string;
  topic: PointTopic;
  /** Piece, scale or exercise it's about; empty for general points. */
  piece: string;
  /** Where the point came from. "ai" for Claude; later checks add their own. */
  source?: string;
};

export type PracticeItem = {
  assignment_id: string;
  practiced: boolean;
  confidence: "high" | "medium" | "low";
  minutes: number;
  note: string;
};

/** A current piece (from the student's repertoire) that isn't on the assignment list. */
export type RepertoireCheck = { title: string; practiced: boolean; note: string };

/** Letter grade for how well a session was used. Empty when not counted. */
export const PRACTICE_GRADES = ["A", "B", "C", "D", "F"] as const;
export type PracticeGrade = (typeof PRACTICE_GRADES)[number];

export type PracticeAnalysis = {
  counted: boolean;
  /** Missing on reviews written before grading was added; empty when not counted. */
  grade?: PracticeGrade | "";
  /** One short line on why the session got that grade. */
  grade_reason?: string;
  not_counted_reason: string;
  summary: string;
  items: PracticeItem[];
  /** Missing on reviews written before the practice-review update. */
  repertoire?: RepertoireCheck[];
  other: { label: string; minutes: number }[];
  timeline: { start: string; end: string; label: string }[];
  encouragement?: string;
  going_well?: ReviewPoint[];
  work_on?: ReviewPoint[];
  teacher_note: string;
  /** Older reviews only. */
  flow?: string;
  tips?: string[];
};

/** Claude's written part of a lesson-to-lesson practice review. */
export type PeriodReview = {
  summary: string;
  encouragement: string;
  going_well: ReviewPoint[];
  work_on: ReviewPoint[];
  trends: string[];
  teacher_note: string;
};

/** Bullets for display, falling back to the older "tips" on old reviews. */
export function workOnTexts(r: PracticeAnalysis): string[] {
  if (r.work_on?.length) return r.work_on.map((p) => p.text);
  return r.tips ?? [];
}
