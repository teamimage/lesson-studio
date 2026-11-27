// Main takeaways from the last three approved lessons (lesson-takeaways.sql).
// Claude numbers the lessons 1..N, oldest first; the code turns those numbers
// into dates, "one time" or "repeated", and guest instructor labels, so the
// labels never depend on Claude getting a name right.

export const TAKEAWAY_LESSONS = 3;

/** How wide a takeaway is: a whole piece, one passage of it, or playing in general. */
export type TakeawayScope = "piece" | "section" | "general";

export type TakeawayPoint = {
  text: string;
  /** The piece, scale or exercise, or "" when it applies to everything. */
  piece: string;
  scope: TakeawayScope;
  /** Lesson numbers (1 = oldest of the lessons compared). */
  lessons: number[];
};

export type SpecificPoint = {
  text: string;
  piece: string;
  lessons: number[];
};

export type Takeaways = {
  /** One or two sentences on the progress across the lessons. */
  overall: string;
  takeaways: TakeawayPoint[];
  specifics: SpecificPoint[];
};

/** One of the compared lessons, as the box shows it. */
export type TakeawayLesson = { id: string; date: string; guest: string | null };

export type TakeawaysView =
  | { state: "not_set_up" }
  | { state: "no_lessons" }
  | {
      state: "ready";
      lessons: TakeawayLesson[];
      /** What was written, or null while nothing has been written yet. */
      data: Takeaways | null;
      /** Written from older versions of these lessons (or none yet): write again. */
      stale: boolean;
      writing: boolean;
      error: string | null;
    };

/** The compared lessons a point came from, oldest first, ignoring numbers out of range. */
export function lessonsOf(point: { lessons: number[] }, lessons: TakeawayLesson[]): TakeawayLesson[] {
  const nums = [...new Set(point.lessons)].filter((n) => Number.isInteger(n) && n >= 1 && n <= lessons.length).sort((a, b) => a - b);
  return nums.map((n) => lessons[n - 1]);
}

/**
 * The guest instructor label for a point: "Guest instructor Ana Ruiz" when it
 * came only from guest lessons, "Also from guest instructor Ana Ruiz" when the
 * regular teacher raised it too, null when no guest lesson was involved. A
 * guest lesson with no name typed in reads "Guest instructor".
 */
export function guestLabel(from: TakeawayLesson[]): string | null {
  const guests = from.filter((l) => l.guest !== null);
  if (!guests.length) return null;
  const names = [...new Set(guests.map((l) => l.guest!.trim()).filter(Boolean))];
  const who = names.length ? `guest instructor ${names.join(" and ")}` : "guest instructor";
  return guests.length === from.length ? `G${who.slice(1)}` : `Also from ${who}`;
}
