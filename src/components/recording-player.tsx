import type { RecordingWithUrl } from "@/lib/recordings";
import { deleteRecording, renameRecording } from "@/app/lessons/recording-actions";
import { formatBytes, formatDuration } from "@/lib/format";
import { Pill } from "@/components/ui";
import { LessonVideo } from "@/components/lesson-video";
import { StreamStatus } from "@/components/stream-status";
import { streamingEnabled } from "@/lib/stream";

/**
 * Lesson videos with playback. Teachers (editable) can rename and delete;
 * parents just watch. Rows still uploading show as pending. When fast
 * streaming is set up, teachers also see the streaming copy being prepared.
 */
export function RecordingList({ recordings, editable = false }: { recordings: RecordingWithUrl[]; editable?: boolean }) {
  const shown = editable ? recordings : recordings.filter((r) => r.url);
  if (shown.length === 0) return null;
  const streaming = streamingEnabled();
  return (
    <ul className="flex flex-col gap-3">
      {shown.map((r) => (
        <li key={r.id} className="overflow-hidden rounded-2xl border border-rule bg-sheet">
          {r.url ? (
            <LessonVideo
              recordingId={r.id}
              src={r.url}
              streamReady={r.streamReady}
              controls
              playsInline
              preload="metadata"
              className="aspect-video w-full bg-black"
            />
          ) : (
            <div className="flex aspect-video w-full items-center justify-center bg-rule/40 text-sm text-muted">
              Upload not finished. Choose the same file again to continue it.
            </div>
          )}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-sm">
            <span className="font-medium">{r.label || r.file_name}</span>
            {r.status !== "ready" && <Pill tone="amber">Uploading</Pill>}
            {editable && r.streamReady && <Pill tone="sage">Fast streaming</Pill>}
            <span className="text-muted">
              {[r.duration_seconds ? formatDuration(Number(r.duration_seconds)) : null, formatBytes(Number(r.size_bytes))]
                .filter(Boolean)
                .join(" · ")}
            </span>
            {r.url && (
              <a
                href={`/recordings/${r.id}/full`}
                target="_blank"
                rel="noreferrer"
                className="ml-auto text-accent-ink underline"
              >
                Full quality
              </a>
            )}
          </div>
          {editable && streaming && r.status === "ready" && !r.streamReady && (
            <div className="border-t border-rule px-3 py-2">
              <StreamStatus recordingId={r.id} initialStatus={r.stream_status} initialError={r.stream_error} />
            </div>
          )}
          {editable && (
            <div className="flex flex-wrap items-center gap-2 border-t border-rule px-3 py-2 text-sm">
              <form action={renameRecording} className="flex flex-1 items-center gap-2">
                <input type="hidden" name="recording_id" value={r.id} />
                <input
                  name="label"
                  defaultValue={r.label ?? ""}
                  placeholder="Name it, e.g. Piano camera"
                  className="min-h-9 min-w-0 flex-1 rounded-lg border border-rule bg-paper px-2"
                />
                <button className="font-medium text-accent-ink">Save</button>
              </form>
              <form action={deleteRecording}>
                <input type="hidden" name="recording_id" value={r.id} />
                <button className="text-danger underline">Delete</button>
              </form>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
