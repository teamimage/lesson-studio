"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { lessonLengthSource, writeLength } from "@/lib/lesson-length";
import { requireTeacher } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { findOrCreateTodayLesson } from "@/lib/lesson-today";
import { hasConsent } from "@/lib/recording-consent-data";
import { consentPath } from "@/lib/recording-consent";

/** Start lesson: today's lesson for the student (reused if already started), shown as the lesson card. */
export async function startLesson(fd: FormData) {
  const { teacher } = await requireTeacher();
  const studentId = String(fd.get("student_id") ?? "");
  // No recording without a signed parent consent: collect it first.
  if (!(await hasConsent(studentId))) redirect(consentPath(studentId, `/students/${studentId}`));
  const lessonId = await findOrCreateTodayLesson(studentId, teacher.id);
  if (!lessonId) redirect(`/students/${studentId}?error=lesson`);
  revalidatePath(`/students/${studentId}`);
  redirect(`/lessons/${lessonId}/live`);
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Add lesson: a lesson on a chosen date (usually one that already happened),
 * opened with the video uploader. Reuses a lesson already on that date.
 */
export async function addLesson(fd: FormData) {
  const { teacher } = await requireTeacher();
  const studentId = String(fd.get("student_id") ?? "");
  const date = String(fd.get("lesson_date") ?? "");
  const localToday = String(fd.get("local_today") ?? "");
  if (!ISO_DATE.test(date) || (ISO_DATE.test(localToday) && date > localToday)) {
    redirect(`/students/${studentId}?error=lesson`);
  }
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("lessons")
    .select("id")
    .eq("student_id", studentId)
    .eq("lesson_date", date)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  let lessonId = existing?.id as string | undefined;
  if (!lessonId) {
    const past = ISO_DATE.test(localToday) ? date < localToday : false;
    const { data } = await supabase
      .from("lessons")
      .insert({
        student_id: studentId,
        teacher_id: teacher.id,
        lesson_date: date,
        status: "draft",
        // A past lesson is stamped on its own day, so Start lesson's "started in
        // the last 12 hours" rule never mistakes it for today's lesson.
        ...(past ? { created_at: `${date}T12:00:00Z` } : {}),
      })
      .select("id")
      .single();
    lessonId = data?.id;
  }
  if (!lessonId) redirect(`/students/${studentId}?error=lesson`);
  revalidatePath(`/students/${studentId}`);
  redirect(`/lessons/${lessonId}?upload=1#recordings`);
}

/** Minutes from Start lesson (the lesson's created_at) to now, at least 1. */
async function writeLessonLength(id: string, onlyIfEmpty: boolean) {
  const supabase = await createClient();
  const { data: lesson } = await supabase
    .from("lessons")
    .select("id, created_at, duration_minutes")
    .eq("id", id)
    .maybeSingle();
  if (!lesson) return false;
  if (onlyIfEmpty && lesson.duration_minutes != null) return true;
  // A typed length, or one from the lesson's video, is better than the timer.
  const source = await lessonLengthSource(supabase, id);
  if (source === "manual" || source === "video") return true;
  const minutes = Math.max(1, Math.round((Date.now() - Date.parse(lesson.created_at)) / 60000));
  await writeLength(supabase, id, minutes, "timer");
  revalidatePath(`/lessons/${id}`);
  revalidatePath(`/lessons/${id}/live`);
  return true;
}

/** End lesson: saves how long it ran (from Start lesson to now) and opens the lesson record. */
export async function endLesson(fd: FormData) {
  await requireTeacher();
  const id = String(fd.get("lesson_id") ?? "");
  if (!(await writeLessonLength(id, false))) return;
  redirect(`/lessons/${id}`);
}

/**
 * The music stand's End button: saves the lesson length the same way, so the
 * iPad on the stand is all the teacher needs. A length already saved (End
 * lesson pressed on the lesson card first) is kept.
 */
export async function endLessonFromStand(lessonId: string) {
  await requireTeacher();
  await writeLessonLength(lessonId, true);
}
