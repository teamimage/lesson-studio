"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireTeacher } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// Technique and posture reminders: the teacher adds, edits, keeps (an AI
// suggestion) or clears them. RLS limits every write to the teacher's own
// students.

const MAX = 240;

function clean(v: FormDataEntryValue | null): string {
  return String(v ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX);
}
function kindOf(v: FormDataEntryValue | null): "technique" | "posture" {
  return v === "posture" ? "posture" : "technique";
}
function backTo(fd: FormData, studentId: string): string {
  const back = String(fd.get("back") ?? "");
  return back.startsWith("/") && !back.startsWith("//") ? back : `/students/${studentId}#reminders`;
}
function refresh(studentId: string, lessonId?: string | null) {
  revalidatePath(`/students/${studentId}`);
  revalidatePath(`/family/${studentId}`);
  revalidatePath(`/v3/family/${studentId}`);
  revalidatePath(`/v3/family/${studentId}/practice`);
  revalidatePath("/teacher");
  if (lessonId) {
    revalidatePath(`/lessons/${lessonId}`);
    revalidatePath(`/lessons/${lessonId}/sheet`);
    revalidatePath(`/v3/lessons/${lessonId}`);
  }
}

export async function addReminder(fd: FormData) {
  await requireTeacher();
  const studentId = String(fd.get("student_id") ?? "");
  const text = clean(fd.get("text"));
  const back = backTo(fd, studentId);
  if (!studentId || !text) redirect(back);
  const supabase = await createClient();
  const { data: last } = await supabase
    .from("student_reminders")
    .select("sort_order")
    .eq("student_id", studentId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  await supabase.from("student_reminders").insert({
    student_id: studentId,
    kind: kindOf(fd.get("kind")),
    text,
    status: "active",
    lesson_id: String(fd.get("lesson_id") ?? "") || null,
    sort_order: (last?.sort_order ?? 0) + 1,
  });
  refresh(studentId, String(fd.get("lesson_id") ?? "") || null);
  redirect(back);
}

/** Saves an edited reminder; for an AI suggestion this also keeps it. */
export async function saveReminder(fd: FormData) {
  await requireTeacher();
  const id = String(fd.get("id") ?? "");
  const studentId = String(fd.get("student_id") ?? "");
  const text = clean(fd.get("text"));
  const back = backTo(fd, studentId);
  if (!id) redirect(back);
  const supabase = await createClient();
  if (!text) {
    await supabase.from("student_reminders").update({ status: "cleared", cleared_at: new Date().toISOString() }).eq("id", id);
  } else {
    await supabase
      .from("student_reminders")
      .update({ text, kind: kindOf(fd.get("kind")), status: "active", cleared_at: null })
      .eq("id", id);
  }
  refresh(studentId, String(fd.get("lesson_id") ?? "") || null);
  redirect(back);
}

/** No longer needed: off the family's page, kept for history. */
export async function clearReminder(fd: FormData) {
  await requireTeacher();
  const id = String(fd.get("id") ?? "");
  const studentId = String(fd.get("student_id") ?? "");
  const back = backTo(fd, studentId);
  if (id) {
    const supabase = await createClient();
    await supabase
      .from("student_reminders")
      .update({ status: "cleared", cleared_at: new Date().toISOString() })
      .eq("id", id);
  }
  refresh(studentId, String(fd.get("lesson_id") ?? "") || null);
  redirect(back);
}

/** An AI suggestion the teacher doesn't want. */
export async function dismissReminder(fd: FormData) {
  await requireTeacher();
  const id = String(fd.get("id") ?? "");
  const studentId = String(fd.get("student_id") ?? "");
  const back = backTo(fd, studentId);
  if (id) {
    const supabase = await createClient();
    await supabase.from("student_reminders").delete().eq("id", id).eq("status", "suggested");
  }
  refresh(studentId, String(fd.get("lesson_id") ?? "") || null);
  redirect(back);
}
