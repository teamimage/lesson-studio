"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireTeacher } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { RECORDINGS_BUCKET } from "@/lib/constants";
import { todayISO } from "@/lib/format";

export type StartRecordingInput = {
  lessonId: string;
  fileName: string;
  sizeBytes: number;
  mimeType: string;
  durationSeconds: number | null;
};
export type StartRecordingResult = { id: string; path: string } | { error: string };

// Storage keys can't hold every character a phone puts in a file name.
function safeName(name: string): string {
  const cleaned = name.normalize("NFKD").replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "");
  return cleaned.slice(-120) || "recording";
}

/**
 * Creates (or, when the same file was interrupted earlier, reuses) the
 * recording row for an upload, and returns where the browser should put it.
 */
export async function startRecording(input: StartRecordingInput): Promise<StartRecordingResult> {
  const { teacher } = await requireTeacher();
  const supabase = await createClient();

  const { data: lesson } = await supabase
    .from("lessons")
    .select("id, student_id")
    .eq("id", input.lessonId)
    .maybeSingle();
  if (!lesson) return { error: "That lesson wasn't found." };

  const fileName = String(input.fileName || "recording").slice(0, 200);
  const sizeBytes = Math.max(0, Math.floor(Number(input.sizeBytes) || 0));

  const { data: existing } = await supabase
    .from("recordings")
    .select("id, storage_path")
    .eq("lesson_id", lesson.id)
    .eq("file_name", fileName)
    .eq("size_bytes", sizeBytes)
    .eq("status", "uploading")
    .limit(1)
    .maybeSingle();
  if (existing) return { id: existing.id, path: existing.storage_path };

  const id = crypto.randomUUID();
  const path = `${teacher.id}/${lesson.student_id}/${id}/${safeName(fileName)}`;
  const duration = Number(input.durationSeconds);
  const { error } = await supabase.from("recordings").insert({
    id,
    teacher_id: teacher.id,
    student_id: lesson.student_id,
    lesson_id: lesson.id,
    storage_path: path,
    file_name: fileName,
    mime_type: input.mimeType || "video/mp4",
    size_bytes: sizeBytes,
    duration_seconds: Number.isFinite(duration) && duration > 0 ? duration : null,
  });
  if (error) return { error: "Couldn't start the upload. Try again." };
  return { id, path };
}

/** Marks a recording ready once its file is in storage. */
export async function finishRecording(id: string): Promise<{ ok: boolean }> {
  await requireTeacher();
  const supabase = await createClient();
  const { data: rec } = await supabase.from("recordings").select("*").eq("id", id).maybeSingle();
  if (!rec) return { ok: false };
  const { data: exists } = await supabase.storage.from(RECORDINGS_BUCKET).exists(rec.storage_path);
  if (!exists) return { ok: false };
  await supabase.from("recordings").update({ status: "ready" }).eq("id", id);
  revalidatePath(`/lessons/${rec.lesson_id}`);
  revalidatePath(`/students/${rec.student_id}`);
  revalidatePath(`/family/${rec.student_id}`);
  return { ok: true };
}

export async function renameRecording(fd: FormData) {
  await requireTeacher();
  const id = String(fd.get("recording_id") ?? "");
  const label = String(fd.get("label") ?? "").trim().slice(0, 80);
  const supabase = await createClient();
  const { data: rec } = await supabase
    .from("recordings")
    .update({ label: label || null })
    .eq("id", id)
    .select("lesson_id")
    .maybeSingle();
  if (rec) revalidatePath(`/lessons/${rec.lesson_id}`);
}

export async function deleteRecording(fd: FormData) {
  await requireTeacher();
  const id = String(fd.get("recording_id") ?? "");
  const supabase = await createClient();
  const { data: rec } = await supabase.from("recordings").select("*").eq("id", id).maybeSingle();
  if (!rec) return;
  await supabase.storage.from(RECORDINGS_BUCKET).remove([rec.storage_path]);
  await supabase.from("recordings").delete().eq("id", id);
  revalidatePath(`/lessons/${rec.lesson_id}`);
  revalidatePath(`/students/${rec.student_id}`);
  revalidatePath(`/family/${rec.student_id}`);
}

/** Starts a draft lesson for today so a video can be uploaded before notes exist. */
export async function startLessonForRecording(fd: FormData) {
  const { teacher } = await requireTeacher();
  const studentId = String(fd.get("student_id") ?? "");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lessons")
    .insert({ student_id: studentId, teacher_id: teacher.id, lesson_date: todayISO(), status: "draft" })
    .select("id")
    .single();
  if (error || !data) redirect(`/students/${studentId}?error=lesson`);
  revalidatePath(`/students/${studentId}`);
  redirect(`/lessons/${data.id}?upload=1#recordings`);
}
