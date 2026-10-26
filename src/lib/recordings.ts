import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/types";
import { RECORDINGS_BUCKET } from "@/lib/constants";

export type Recording = Tables<"recordings">;
/** A recording with a short-lived signed playback URL (null until uploaded). */
export type RecordingWithUrl = Recording & { url: string | null };

// Long enough to watch a full lesson without the link expiring mid-video.
const SIGNED_URL_SECONDS = 6 * 60 * 60;

async function withUrls(rows: Recording[]): Promise<RecordingWithUrl[]> {
  const ready = rows.filter((r) => r.status === "ready");
  if (ready.length === 0) return rows.map((r) => ({ ...r, url: null }));
  const supabase = await createClient();
  const { data } = await supabase.storage
    .from(RECORDINGS_BUCKET)
    .createSignedUrls(
      ready.map((r) => r.storage_path),
      SIGNED_URL_SECONDS,
    );
  const urls = new Map((data ?? []).map((d) => [d.path, d.signedUrl]));
  return rows.map((r) => ({ ...r, url: r.status === "ready" ? (urls.get(r.storage_path) ?? null) : null }));
}

export async function listRecordingsForLesson(lessonId: string): Promise<RecordingWithUrl[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("recordings")
    .select("*")
    .eq("lesson_id", lessonId)
    .order("created_at");
  return withUrls(data ?? []);
}

export async function listRecordingsForStudent(studentId: string, limit = 20): Promise<RecordingWithUrl[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("recordings")
    .select("*")
    .eq("student_id", studentId)
    .eq("status", "ready")
    .order("created_at", { ascending: false })
    .limit(limit);
  return withUrls(data ?? []);
}
