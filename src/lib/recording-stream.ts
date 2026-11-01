import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/types";
import { RECORDINGS_BUCKET } from "@/lib/constants";
import { getStreamState, startStreamCopy, streamingEnabled, type StreamState } from "@/lib/stream";

type Recording = Tables<"recordings">;

export type StreamProgress = {
  status: "off" | "waiting" | "pending" | "ready" | "error";
  percent: number | null;
  error: string | null;
};

// Cloudflare fetches the whole original from this link, which can take a
// while for a multi-gigabyte file.
const SOURCE_LINK_SECONDS = 24 * 60 * 60;

/**
 * Starts the streaming copy of a recording if it hasn't been started, or
 * checks on one that's being prepared, and saves what Cloudflare says.
 * `retry` starts over after a failure. Runs as the signed-in teacher, so
 * row-level security limits it to their own recordings.
 */
export async function syncStream(rec: Recording, { retry = false } = {}): Promise<StreamProgress> {
  if (!streamingEnabled()) return { status: "off", percent: null, error: null };
  if (rec.status !== "ready") return { status: "waiting", percent: null, error: null };
  const supabase = await createClient();

  const save = async (uid: string, s: StreamState) => {
    await supabase
      .from("recordings")
      .update({ stream_uid: uid, stream_status: s.status, stream_hls_url: s.hlsUrl, stream_error: s.error })
      .eq("id", rec.id);
    return { status: s.status, percent: s.percent, error: s.error } satisfies StreamProgress;
  };

  try {
    if (!rec.stream_uid || (retry && rec.stream_status === "error")) {
      const { data: link } = await supabase.storage
        .from(RECORDINGS_BUCKET)
        .createSignedUrl(rec.storage_path, SOURCE_LINK_SECONDS);
      if (!link?.signedUrl) throw new Error("Couldn't make a link to the original video.");
      const started = await startStreamCopy({
        sourceUrl: link.signedUrl,
        name: rec.label || rec.file_name,
        recordingId: rec.id,
      });
      return await save(started.uid, started);
    }
    if (rec.stream_status === "ready") return { status: "ready", percent: 100, error: null };
    if (rec.stream_status === "error") return { status: "error", percent: null, error: rec.stream_error };
    return await save(rec.stream_uid, await getStreamState(rec.stream_uid));
  } catch (e) {
    const error = e instanceof Error ? e.message : "Something went wrong with Cloudflare Stream.";
    // A failed start leaves no Cloudflare video; mark the row so the page
    // offers Try again instead of retrying on every load.
    await supabase.from("recordings").update({ stream_status: "error", stream_error: error }).eq("id", rec.id);
    return { status: "error", percent: null, error };
  }
}
