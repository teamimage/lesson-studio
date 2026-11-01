import type { Recording, RecordingWithUrl } from "@/lib/recordings";
import { deleteRecording, restoreRecording } from "@/app/lessons/recording-actions";
import { formatBytes, formatDuration } from "@/lib/format";
import { Pill } from "@/components/ui";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { LessonVideo } from "@/components/lesson-video";
import { StreamStatus } from "@/components/stream-status";
import { streamingEnabled } from "@/lib/stream";

/**
 * Lesson videos with playback. Each video is named by its original file
 * name (e.g. IMG_1962.MOV). Teachers (editable) can delete (archive);
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
            <div className="flex justify-end border-t border-rule px-3 py-2 text-sm">
              <form action={deleteRecording}>
                <input type="hidden" name="recording_id" value={r.id} />
                <ConfirmSubmit
                  className="text-danger underline"
                  message={`Delete "${r.label || r.file_name}"${
                    r.duration_seconds ? ` (${formatDuration(Number(r.duration_seconds))})` : ""
                  } from this lesson?\n\nThe streaming copy is deleted. The original full-quality file and its transcript are kept, so you can bring it back here with Restore video. To free the space, delete it for good under Settings → Admin → Storage.`}
                >
                  Delete video
                </ConfirmSubmit>
              </form>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * Videos taken off this lesson with Delete video. The original is kept, so
 * Restore video puts it back and makes a new streaming copy.
 */
export function ArchivedRecordings({ recordings }: { recordings: Recording[] }) {
  if (recordings.length === 0) return null;
  return (
    <ul className="flex flex-col gap-2">
      {recordings.map((r) => (
        <li
          key={r.id}
          className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-dashed border-rule px-3 py-2.5 text-sm"
        >
          <div className="min-w-0 flex-1">
            <span className="font-medium">{r.label || r.file_name}</span>
            <span className="text-muted">
              {" · "}
              {[r.duration_seconds ? formatDuration(Number(r.duration_seconds)) : null, formatBytes(Number(r.size_bytes))]
                .filter(Boolean)
                .join(" · ")}
            </span>
            <div className="text-xs text-muted">Deleted from this lesson. The original is kept.</div>
          </div>
          <form action={restoreRecording}>
            <input type="hidden" name="recording_id" value={r.id} />
            <button className="rounded-full border border-accent/40 px-3 py-1.5 font-medium text-accent-ink hover:bg-accent-soft">
              Restore video
            </button>
          </form>
        </li>
      ))}
    </ul>
  );
}
