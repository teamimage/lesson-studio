"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireTeacher } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { findOrCreateTodayLesson } from "@/lib/lesson-today";

/** Start lesson: today's lesson for the student (reused if already started), shown as the lesson card. */
export async function startLesson(fd: FormData) {
  const { teacher } = await requireTeacher();
  const studentId = String(fd.get("student_id") ?? "");
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

/** End lesson: saves how long it ran (from Start lesson to now) and opens the lesson record. */
export async function endLesson(fd: FormData) {
  await requireTeacher();
  const id = String(fd.get("lesson_id") ?? "");
  const supabase = await createClient();
  const { data: lesson } = await supabase.from("lessons").select("id, created_at").eq("id", id).maybeSingle();
  if (!lesson) return;
  const minutes = Math.max(1, Math.round((Date.now() - Date.parse(lesson.created_at)) / 60000));
  await supabase.from("lessons").update({ duration_minutes: minutes }).eq("id", id);
  revalidatePath(`/lessons/${id}`);
  redirect(`/lessons/${id}`);
}
