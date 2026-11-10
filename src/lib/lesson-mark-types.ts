/** A lesson on a practice calendar day: one on record, or one still to come from the schedule. */
export type LessonMark = {
  date: string;
  /** The saved lesson, when there is one. */
  lessonId: string | null;
  status: "draft" | "approved" | null;
  /** "HH:MM" studio time, for scheduled lessons when known. */
  time: string | null;
  minutes: number | null;
  /**
   * Length needs a person: "unknown" when the video's length couldn't be
   * read, "differs" when a typed length is far from the video's.
   */
  lengthFlag?: "unknown" | "differs" | null;
  /** The video's length in minutes, when known. */
  videoMinutes?: number | null;
  /** From the schedule, not yet taught. */
  upcoming: boolean;
};
