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
