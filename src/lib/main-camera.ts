import "server-only";
import type { createClient } from "@/lib/supabase/server";

type Db = Awaited<ReturnType<typeof createClient>>;

/**
 * The lesson's main camera: the video with the good microphone. Its sound
 * plays whichever angle is on screen, and its transcript makes the AI notes.
 * Null when none was chosen (or before multi-angle.sql has been run).
 */
export async function lessonMainId(db: Db, lessonId: string): Promise<string | null> {
  const { data, error } = await db.from("lessons").select("main_recording_id").eq("id", lessonId).maybeSingle();
  if (error) return null;
  return data?.main_recording_id ?? null;
}

/** Saves the main camera. False when the column isn't there yet. */
export async function setLessonMain(db: Db, lessonId: string, recordingId: string): Promise<boolean> {
  const { error } = await db.from("lessons").update({ main_recording_id: recordingId }).eq("id", lessonId);
  return !error;
}
