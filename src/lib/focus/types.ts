// "What we're working on": the short lasting list per student. See
// admin/working-on.sql for the tables.

export type FocusState = "proposed" | "open" | "watching" | "closed";
export type FocusVerdict = "first_time" | "better" | "same" | "went_back" | "done" | "not_heard" | "not_mentioned";
export type FocusSource = "lesson" | "practice" | "parent" | "teacher";

export type FocusItemRow = {
  id: string;
  student_id: string;
  title: string;
  piece: string;
  parent_cue: string;
  state: FocusState;
  lesson_id: string | null;
  do_first: string[];
  opened_on: string;
  closed_on: string | null;
  sort_order: number;
  created_at: string;
};

export type FocusEventRow = {
  id: string;
  focus_item_id: string;
  student_id: string;
  event_date: string;
  source: FocusSource;
  lesson_id: string | null;
  practice_session_id: string | null;
  verdict: FocusVerdict;
  note: string;
  created_at: string;
};

/** The word the family sees beside a focus point. */
export type FocusStatus = "working" | "better" | "went_back" | "done";

export const STATUS_WORDS: Record<FocusStatus, string> = {
  working: "Working",
  better: "Better",
  went_back: "Went back",
  done: "Done",
};

/** A focus point with the status the rules work out from its events. */
export type FocusItem = FocusItemRow & {
  status: FocusStatus;
  /** Practices in a row, newest back, with no improvement. */
  sameRun: number;
  /** Teacher only: no improvement in four practices running. */
  stuck: boolean;
  /** The newest note from a lesson or practice, for the teacher. */
  lastNote: string;
  lastHeardOn: string | null;
};

/** The tag on one line of a practice's "what changed" card. */
export type ChangeTag = "first_time" | "better" | "same" | "went_back" | "left";
export type ChangeLine = { tag: ChangeTag; text: string; focus_id: string };

export const CHANGE_WORDS: Record<ChangeTag, string> = {
  first_time: "First time",
  better: "Better",
  same: "Same",
  went_back: "Went back",
  left: "Left for tomorrow",
};

export const MAX_FOCUS = 3;
/** A point goes quiet on the family's card after this many practices with no change. */
export const QUIET_AFTER = 3;
/** The teacher is told at this many: "your rule: change something". */
export const STUCK_AT = 4;
