"use server";

import { revalidatePath } from "next/cache";
import { requireTeacher } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { RECORDINGS_BUCKET } from "@/lib/constants";
import { syncStream } from "@/lib/recording-stream";
import { deleteStream } from "@/lib/stream";

export type StartRecordingInput = {
  lessonId: string;
  fileName: string;
  sizeBytes: number;
  mimeType: string;
  durationSeconds: number | null;
  /** First-frame time read from the video file's metadata, if found. */
  startedAt?: string | null;
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
  const startedMs = input.startedAt ? Date.parse(input.startedAt) : NaN;
  const startedAt = Number.isFinite(startedMs) ? new Date(startedMs).toISOString() : null;
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
    ...(startedAt ? { started_at: startedAt, started_at_source: "file" } : {}),
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
  // Start the fast streaming copy right away. Best effort: if it fails, the
  // lesson page shows why and offers Try again; the original still plays.
  await syncStream({ ...rec, status: "ready" });
  revalidatePath(`/lessons/${rec.lesson_id}`);
  revalidatePath(`/students/${rec.student_id}`);
  revalidatePath(`/family/${rec.student_id}`);
  return { ok: true };
}

export async function deleteRecording(fd: FormData) {
  await requireTeacher();
  const id = String(fd.get("recording_id") ?? "");
  const supabase = await createClient();
  const { data: rec } = await supabase.from("recordings").select("*").eq("id", id).maybeSingle();
  if (!rec) return;
  await supabase.storage.from(RECORDINGS_BUCKET).remove([rec.storage_path]);
  if (rec.stream_uid) await deleteStream(rec.stream_uid);
  await supabase.from("recordings").delete().eq("id", id);
  revalidatePath(`/lessons/${rec.lesson_id}`);
  revalidatePath(`/students/${rec.student_id}`);
  revalidatePath(`/family/${rec.student_id}`);
}

/**
 * Saves when a recording's first frame happened (wall-clock), so the music
 * stand's page turns can be placed on the video.
 */
export async function setRecordingStart(
  id: string,
  startedAt: string | null,
  source: "file" | "lineup",
): Promise<{ ok: boolean }> {
  await requireTeacher();
  const t = startedAt ? Date.parse(startedAt) : NaN;
  if (startedAt && !Number.isFinite(t)) return { ok: false };
  const supabase = await createClient();
  const { data: rec } = await supabase
    .from("recordings")
    .update({
      started_at: startedAt ? new Date(t).toISOString() : null,
      started_at_source: startedAt ? source : null,
    })
    .eq("id", id)
    .select("lesson_id")
    .maybeSingle();
  if (!rec) return { ok: false };
  revalidatePath(`/lessons/${rec.lesson_id}`);
  return { ok: true };
}
