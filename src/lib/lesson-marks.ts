import "server-only";
import { getStudent } from "@/lib/data";
import { loadSchedule } from "@/lib/schedule-data";
import { occurrencesBetween } from "@/lib/schedule";
import { todayISO } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { LessonMark } from "@/lib/lesson-mark-types";
import { removeEmptyDraftLessons } from "@/lib/empty-lessons";
import { reconcileLengths } from "@/lib/lesson-length";

/**
 * Lesson days for the practice calendars, keyed by date: lessons on record
 * (any status) up to today, and lessons still to come from the schedule
 * (weekly slots, moves and extras; cancelled weeks left out). A scheduled
 * lesson on a day that already has a lesson on record is not repeated.
 */
export async function listLessonMarks(
  studentId: string,
  from: string,
  to: string,
  today = todayISO(),
): Promise<Record<string, LessonMark[]>> {
  // An empty draft (a lesson started or added that never got a video) isn't a lesson day.
  await removeEmptyDraftLessons(studentId).catch(() => {});
  const supabase = await createClient();
  const [lessonRes, student] = await Promise.all([
    supabase
      .from("lessons")
      .select("id, lesson_date, status, duration_minutes")
      .eq("student_id", studentId)
      .gte("lesson_date", from)
      .lte("lesson_date", to)
      .order("lesson_date"),
    to >= today ? getStudent(studentId) : Promise.resolve(null),
  ]);

  const out: Record<string, LessonMark[]> = {};
  const add = (m: LessonMark) => (out[m.date] ??= []).push(m);

  // Lengths follow the lesson videos; ones nobody could read are flagged.
  const lessons = lessonRes.data ?? [];
  const checks = await reconcileLengths(
    supabase,
    lessons.map((l) => l.id),
  ).catch(() => ({}) as Awaited<ReturnType<typeof reconcileLengths>>);
  for (const l of lessons) {
    const c = checks[l.id];
    add({
      date: l.lesson_date,
      lessonId: l.id,
      status: l.status,
      time: null,
      minutes: c ? c.minutes : l.duration_minutes,
      lengthFlag: c?.flag ?? null,
      videoMinutes: c?.videoMinutes ?? null,
      upcoming: false,
    });
  }

  if (student) {
    try {
      const start = from > today ? from : today;
      const schedule = await loadSchedule([student], start);
      for (const o of occurrencesBetween(schedule.slots, schedule.changes, start, to)) {
        if (o.kind === "cancelled" || out[o.date]) continue;
        add({ date: o.date, lessonId: null, status: null, time: o.time, minutes: o.minutes, upcoming: true });
      }
    } catch {
      // No schedule: past lessons still show.
    }
  }
  return out;
}
