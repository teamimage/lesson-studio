"use server";

import { revalidatePath } from "next/cache";
import { requireTeacher } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { takeVideoLength } from "@/lib/lesson-length";

/** "Use the video's length": replaces a typed length with the video's. */
export async function applyVideoLength(fd: FormData) {
  await requireTeacher();
  const id = String(fd.get("lesson_id") ?? "");
  const studentId = String(fd.get("student_id") ?? "");
  const supabase = await createClient();
  await takeVideoLength(supabase, id);
  revalidatePath(`/lessons/${id}`);
  revalidatePath(`/v3/lessons/${id}`);
  if (studentId) {
    revalidatePath(`/students/${studentId}`);
    revalidatePath(`/v3/students/${studentId}`);
  }
}
