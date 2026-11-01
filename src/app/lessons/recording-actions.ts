"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTeacher } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { RECORDINGS_BUCKET } from "@/lib/constants";
import { syncStream } from "@/lib/recording-stream";
import { deleteStream } from "@/lib/stream";
import { latestTranscript, start as startProcessing } from "@/lib/ai/process-lesson";

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
  const { teacher } = await requireTeacher();
  const supabase = await createClient();
  const { data: rec } = await supabase.from("recordings").select("*").eq("id", id).maybeSingle();
  if (!rec) return { ok: false };
  const { data: exists } = await supabase.storage.from(RECORDINGS_BUCKET).exists(rec.storage_path);
  if (!exists) return { ok: false };
  await supabase.from("recordings").update({ status: "ready" }).eq("id", id);
  // Start the fast streaming copy right away. Best effort: if it fails, the
  // lesson page shows why and offers Try again; the original still plays.
  await syncStream({ ...rec, status: "ready" });
  await autoProcess(teacher.id, rec.lesson_id, rec.id);
  revalidatePath(`/lessons/${rec.lesson_id}`);
  revalidatePath(`/students/${rec.student_id}`);
  revalidatePath(`/family/${rec.student_id}`);
  return { ok: true };
}

function revalidateRecording(rec: { lesson_id: string; student_id: string }) {
  revalidatePath(`/lessons/${rec.lesson_id}`);
  revalidatePath(`/students/${rec.student_id}`);
  revalidatePath(`/family/${rec.student_id}`);
  revalidatePath(`/teacher/${rec.student_id}/recordings`);
  revalidatePath("/admin/storage");
}

/**
 * "Delete video" on a lesson: removes the Cloudflare streaming copy and
 * takes the video off the lesson, but keeps the original file and its
 * transcript (archived). Restore video brings it back; Settings -> Admin ->
 * Storage deletes it for good.
 */
export async function deleteRecording(fd: FormData) {
  await requireTeacher();
  const id = String(fd.get("recording_id") ?? "");
  const supabase = await createClient();
  const { data: rec } = await supabase.from("recordings").select("*").eq("id", id).maybeSingle();
  if (!rec) return;
  const { error } = await supabase
    .from("recordings")
    .update({
      archived_at: new Date().toISOString(),
      stream_uid: null,
      stream_status: null,
      stream_hls_url: null,
      stream_error: null,
    })
    .eq("id", id);
  // Without the archived_at column (archived-videos.sql not run yet) nothing
  // is touched, so the video stays as it was.
  if (error) redirect(`/lessons/${rec.lesson_id}?video=setup#recordings`);
  if (rec.stream_uid) await deleteStream(rec.stream_uid);
  revalidateRecording(rec);
}

/** Restore video: puts an archived original back on its lesson and makes a new streaming copy. */
export async function restoreRecording(fd: FormData) {
  await requireTeacher();
  const id = String(fd.get("recording_id") ?? "");
  const supabase = await createClient();
  const { data: rec } = await supabase
    .from("recordings")
    .update({ archived_at: null })
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (!rec) return;
  // Best effort, as on upload: if it fails, the lesson page offers Try again
  // and the original plays meanwhile.
  await syncStream(rec);
  revalidateRecording(rec);
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

/**
 * Starts the AI processing (transcript, then Claude's draft) as soon as a
 * lesson's first video is uploaded. Only for draft lessons with no processing
 * yet, so a second camera angle or an approved lesson doesn't pay again; the
 * Process video button on the lesson page still covers those. Best effort:
 * a missing API key or table just leaves the button there.
 */
async function autoProcess(teacherId: string, lessonId: string, recordingId: string) {
  try {
    const supabase = await createClient();
    const { data: lesson } = await supabase.from("lessons").select("status").eq("id", lessonId).maybeSingle();
    if (lesson?.status !== "draft") return;
    if (await latestTranscript(supabase, lessonId)) return;
    if (!process.env.ANTHROPIC_API_KEY || !process.env.ASSEMBLYAI_API_KEY) return;
    await startProcessing(teacherId, lessonId, recordingId);
  } catch {
    // The lesson page shows Process video for a manual start.
  }
}
