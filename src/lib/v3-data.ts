import "server-only";
import { type LessonFull, type PracticeWeek, type Student, getPracticeWeek, listLessons, listRepertoire } from "@/lib/data";
import type { Repertoire } from "@/lib/data";
import { todayISO } from "@/lib/format";
import { findTodayLesson } from "@/lib/lesson-today";
import { listPracticeSessions, type PracticeSessionView } from "@/lib/practice/data";
import { getConsentStatus } from "@/lib/recording-consent-data";
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
  /** A lesson started in the last 12 hours, if any. */
  runningLessonId: string | null;
  next: { date: string; source: "set" | "weekly" } | null;
  /** Lesson day is today (by schedule, or a lesson was started today). */
  isToday: boolean;
  /** A lesson record dated today already exists. */
  hadLessonToday: boolean;
};

export async function loadTodayRow(student: Student, today = todayISO()): Promise<TodayRow> {
  const id = student.id;
  const [lessons, week, repertoire, sessions, consent, running] = await Promise.all([
    listLessons(id, 6),
    getPracticeWeek(id, today),
    listRepertoire(id),
    listPracticeSessions(id, 1),
    getConsentStatus(id),
    findTodayLesson(id),
  ]);
  const next = nextLesson(student, lessons[0] ?? null, today);
  const hadLessonToday = lessons.some((l) => l.lesson_date === today);
  return {
    student,
    lessons,
    week,
    repertoire,
    lastSession: sessions[0] ?? null,
    consent: consent.state,
    runningLessonId: running,
    next,
    isToday: next?.date === today || !!running || hadLessonToday,
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
