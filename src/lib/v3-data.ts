import "server-only";
import { type LessonFull, type PracticeWeek, type Student, getPracticeWeek, listLessons, listRepertoire } from "@/lib/data";
import type { Repertoire } from "@/lib/data";
import { todayISO } from "@/lib/format";
import { findRunningLesson } from "@/lib/lesson-today";
import { listPracticeSessions, type PracticeSessionView } from "@/lib/practice/data";
import { getConsentStatus } from "@/lib/recording-consent-data";
import { type Occurrence, isOn, nextOccurrence } from "@/lib/schedule";
import { nextLesson } from "@/lib/teacher-data";

// Version 3 (task-first) helpers: everything the Today screen needs about
// one student, in one call.

export type TodayRow = {
  student: Student;
  lessons: LessonFull[];
  week: PracticeWeek;
  repertoire: Repertoire[];
  lastSession: PracticeSessionView | null;
  consent: "signed" | "needed" | "setup";
  /** A lesson started and not yet ended (at most 3 hours old), if any. */
  runningLessonId: string | null;
  /** The next lesson: from the schedule (Settings → Lesson times); the old Lesson day / Next lesson fields only when nothing is scheduled. */
  next: { date: string; time: string | null; source: "schedule" | "set" | "weekly" } | null;
  /** Lesson day is today (by schedule, or a lesson was started today). */
  isToday: boolean;
  /** A lesson record dated today already exists. */
  hadLessonToday: boolean;
};

/**
 * `upcoming` is this student's scheduled lessons from today on (see
 * loadUpcoming); pass it so every screen agrees on the next lesson.
 */
export async function loadTodayRow(student: Student, today = todayISO(), upcoming?: Occurrence[]): Promise<TodayRow> {
  const id = student.id;
  const [lessons, week, repertoire, sessions, consent, running] = await Promise.all([
    listLessons(id, 6),
    getPracticeWeek(id, today),
    listRepertoire(id),
    listPracticeSessions(id, 1),
    getConsentStatus(id),
    findRunningLesson(id),
  ]);
  const hadLessonToday = lessons.some((l) => l.lesson_date === today);
  const scheduled = upcoming?.length ? nextOccurrence(upcoming, today) : null;
  const old = upcoming?.length ? null : nextLesson(student, lessons[0] ?? null, today);
  const next = scheduled
    ? { date: scheduled.date, time: scheduled.time, source: "schedule" as const }
    : old
      ? { ...old, time: null }
      : null;
  const lessonToday = upcoming?.length ? upcoming.some((o) => o.date === today && isOn(o)) : next?.date === today;
  return {
    student,
    lessons,
    week,
    repertoire,
    lastSession: sessions[0] ?? null,
    consent: consent.state,
    runningLessonId: running,
    next,
    isToday: lessonToday || !!running || hadLessonToday,
    hadLessonToday,
  };
}

/** "4:30 pm", "16:30", "4pm" → minutes after midnight, for ordering. */
export function lessonMinutes(time: string | null | undefined): number {
  const m = time?.trim().toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm|a|p)?/);
  if (!m) return 24 * 60;
  let h = Number(m[1]) % 24;
  const pm = m[3]?.startsWith("p");
  const am = m[3]?.startsWith("a");
  if (pm && h < 12) h += 12;
  if (am && h === 12) h = 0;
  // "4:30" with no am/pm: music lessons are afternoons, so read 1–7 as pm.
  if (!m[3] && h >= 1 && h <= 7) h += 12;
  return h * 60 + Number(m[2] ?? 0);
}
