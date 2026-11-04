import "server-only";
import { createClient } from "@/lib/supabase/server";
import { REFERENCE_BUCKET, trackLabel, type ListenTrack, type ReferenceRecording } from "@/lib/reference-recordings";

// Long enough to listen a few times through a practice session.
const SIGNED_URL_SECONDS = 6 * 60 * 60;

// An upload that never finished after this long is shown as failed.
const UPLOAD_STALE_MS = 2 * 60 * 60 * 1000;

export type ReferenceLibrary = {
  ready: boolean;
  recordings: ReferenceRecording[];
  /** Signed addresses to play uploaded files, by recording id (when asked for). */
  urls: Record<string, string>;
};

/**
 * The teacher's reference recordings, by book then track. `ready` is false
 * until reference-recordings.sql has been run, so pages can say so.
 */
export async function listReferenceRecordings({ withUrls = false } = {}): Promise<ReferenceLibrary> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reference_recordings")
    .select("*")
    .order("book", { nullsFirst: false })
    .order("track_no", { nullsFirst: false })
    .order("title");
  if (error) return { ready: false, recordings: [], urls: {} };
  const staleBefore = Date.now() - UPLOAD_STALE_MS;
  const urls: Record<string, string> = {};
  const files = (data ?? []).filter((r) => r.storage_path && r.status === "ready");
  if (withUrls && files.length) {
    const { data: signed } = await supabase.storage
      .from(REFERENCE_BUCKET)
      .createSignedUrls(
        files.map((r) => r.storage_path!),
        SIGNED_URL_SECONDS,
      );
    const byPath = new Map(files.map((r) => [r.storage_path!, r.id]));
    for (const s of signed ?? []) {
      const id = s.path ? byPath.get(s.path) : undefined;
      if (id && s.signedUrl) urls[id] = s.signedUrl;
    }
  }
  return {
    ready: true,
    urls,
    recordings: (data ?? [])
      // An upload still going (maybe in another tab) shows as uploading; one that died, as failed, so it can be deleted.
      .map((r): ReferenceRecording => ({
        id: r.id,
        title: r.title,
        instrument: r.instrument,
        book: r.book,
        track_no: r.track_no,
        score_id: r.score_id,
        source: r.source === "link" ? "link" : "file",
        status: r.status !== "uploading" ? "ready" : Date.parse(r.created_at) > staleBefore ? "uploading" : "failed",
        file_name: r.file_name,
        size_bytes: r.size_bytes,
        duration_seconds: r.duration_seconds,
        link_url: r.link_url,
        rights: r.rights_confirmed_at ? { at: r.rights_confirmed_at, email: r.rights_confirmed_email } : null,
      })),
  };
}

/**
 * The recordings a practice plan assigns, with signed addresses to play them.
 * Row-level security lets a family read only recordings their child's
 * approved lesson assigns. Missing table (SQL not run yet) gives {}.
 */
export async function listenTracksFor(recordingIds: (string | null | undefined)[]): Promise<Record<string, ListenTrack>> {
  const ids = [...new Set(recordingIds.filter((x): x is string => !!x))];
  if (!ids.length) return {};
  const supabase = await createClient();
  const { data } = await supabase
    .from("reference_recordings")
    .select("id, title, book, track_no, storage_path, link_url, duration_seconds, source, status")
    .in("id", ids);
  const rows = (data ?? []).filter((r) => r.status === "ready");
  const paths = rows.map((r) => r.storage_path).filter((p): p is string => !!p);
  const urls = new Map<string, string>();
  if (paths.length) {
    const { data: signed } = await supabase.storage.from(REFERENCE_BUCKET).createSignedUrls(paths, SIGNED_URL_SECONDS);
    for (const s of signed ?? []) if (s.path && s.signedUrl) urls.set(s.path, s.signedUrl);
  }
  const out: Record<string, ListenTrack> = {};
  for (const r of rows) {
    out[r.id] = {
      id: r.id,
      title: r.title,
      book: r.book,
      track_no: r.track_no,
      url: r.storage_path ? (urls.get(r.storage_path) ?? null) : null,
      link_url: r.link_url,
      duration_seconds: r.duration_seconds,
    };
  }
  return out;
}

/** Recordings to choose from in the lesson form's Listening items. */
export async function listeningChoices(
  instrument: string,
): Promise<{ id: string; title: string; label: string; book: string | null }[]> {
  const { recordings } = await listReferenceRecordings();
  return recordings
    .filter((r) => r.status === "ready" && (!r.instrument || r.instrument === instrument))
    .map((r) => ({ id: r.id, title: r.title, label: trackLabel(r, false), book: r.book }));
}
