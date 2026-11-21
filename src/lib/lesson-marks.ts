import "server-only";
import { getStudent } from "@/lib/data";
import { loadSchedule } from "@/lib/schedule-data";
import { isOn, occurrencesBetween } from "@/lib/schedule";
import { todayISO } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { LessonMark, LessonPending } from "@/lib/lesson-mark-types";
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
  const pendingOf = await lessonPendingStates(
    supabase,
    lessons.filter((l) => l.status !== "approved").map((l) => l.id),
  );
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
      pending: l.status === "approved" ? null : (pendingOf[l.id] ?? "review"),
    });
  }

  // The family can't open a lesson until the teacher approves it, but should
  // still see that a lesson happened and its write-up is on the way
  // (pending-lesson-days.sql; nothing extra before it has run, or for the teacher).
  const { data: familyPending } = await (supabase as unknown as Rpc)
    .rpc("pending_lesson_days", { p_student: studentId, p_from: from, p_to: to })
    .then(
      (r) => r,
      () => ({ data: null, error: null }),
    );
  for (const row of (Array.isArray(familyPending) ? familyPending : []) as { lesson_date: string; processing: boolean }[]) {
    if (out[row.lesson_date]?.some((m) => !m.upcoming)) continue;
    add({
      date: row.lesson_date,
      lessonId: null,
      status: "draft",
      time: null,
      minutes: null,
      upcoming: false,
      pending: row.processing ? "processing" : "review",
    });
  }

  if (student) {
    try {
      const start = from > today ? from : today;
      const schedule = await loadSchedule([student], start);
      for (const o of occurrencesBetween(schedule.slots, schedule.changes, start, to, schedule.closures)) {
        if (!isOn(o) || out[o.date]) continue;
        add({ date: o.date, lessonId: null, status: null, time: o.time, minutes: o.minutes, upcoming: true });
      }
    } catch {
      // No schedule: past lessons still show.
    }
  }
  return out;
}

type Rpc = { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> };

/**
 * For lessons not yet approved: "processing" while a video is still uploading
 * or the write-up is being drafted, otherwise "review" (waiting for approval).
 */
async function lessonPendingStates(
  db: Awaited<ReturnType<typeof createClient>>,
  ids: string[],
): Promise<Record<string, LessonPending>> {
  if (!ids.length) return {};
  const [recs, drafts] = await Promise.all([
    db.from("recordings").select("lesson_id").in("lesson_id", ids).eq("status", "uploading"),
    db.from("lesson_transcripts").select("lesson_id").in("lesson_id", ids).in("status", ["transcribing", "drafting"]),
  ]);
  const out: Record<string, LessonPending> = {};
  for (const r of [...(recs.data ?? []), ...(drafts.data ?? [])]) out[r.lesson_id] = "processing";
  return out;
}
