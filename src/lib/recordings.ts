import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/types";
import { RECORDINGS_BUCKET } from "@/lib/constants";
import { streamingEnabled } from "@/lib/stream";

export type Recording = Tables<"recordings">;
/**
 * A recording with a short-lived signed URL for the original (null until
 * uploaded), and whether a fast streaming copy can be played instead (the
 * player asks /api/recordings/[id]/stream for its address).
 */
export type RecordingWithUrl = Recording & { url: string | null; streamReady: boolean };

/**
 * Teacher pages get a link to the original for every uploaded video. The
 * family side ("stream") only gets the original while the fast streaming copy
 * isn't ready yet; after that, the streaming copy is all it can play.
 */
export type OriginalAccess = "always" | "until-stream";

// Long enough to watch a full lesson without the link expiring mid-video.
const SIGNED_URL_SECONDS = 6 * 60 * 60;

async function withUrls(rows: Recording[], original: OriginalAccess = "always"): Promise<RecordingWithUrl[]> {
  const streaming = streamingEnabled();
  const streamReady = (r: Recording) => streaming && r.status === "ready" && r.stream_status === "ready";
  const needsOriginal = (r: Recording) => r.status === "ready" && (original === "always" || !streamReady(r));
  const ready = rows.filter(needsOriginal);
  if (ready.length === 0) return rows.map((r) => ({ ...r, url: null, streamReady: streamReady(r) }));
  const supabase = await createClient();
  const { data } = await supabase.storage
    .from(RECORDINGS_BUCKET)
    .createSignedUrls(
      ready.map((r) => r.storage_path),
      SIGNED_URL_SECONDS,
    );
  const urls = new Map((data ?? []).map((d) => [d.path, d.signedUrl]));
  return rows.map((r) => ({
    ...r,
    url: needsOriginal(r) ? (urls.get(r.storage_path) ?? null) : null,
    streamReady: streamReady(r),
  }));
}

// Archived videos (removed from their lesson, original kept) are filtered
// here rather than in the query, so pages keep working before the
// archived_at column exists.
const active = (rows: Recording[] | null) => (rows ?? []).filter((r) => !r.archived_at);

export async function listRecordingsForLesson(
  lessonId: string,
  original: OriginalAccess = "always",
): Promise<RecordingWithUrl[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("recordings")
    .select("*")
    .eq("lesson_id", lessonId)
    .order("created_at");
  return withUrls(active(data), original);
}

/** Videos removed from a lesson whose original is kept, for Restore video. */
export async function listArchivedForLesson(lessonId: string): Promise<Recording[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("recordings")
    .select("*")
    .eq("lesson_id", lessonId)
    .order("created_at");
  return (data ?? []).filter((r) => !!r.archived_at);
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
  return withUrls(active(data));
}

/** True when a video can be played: streaming copy ready or original linked. */
export const isPlayable = (r: RecordingWithUrl) => !!r.url || r.streamReady;
