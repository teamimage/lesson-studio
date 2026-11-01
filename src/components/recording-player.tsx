import type { RecordingWithUrl } from "@/lib/recordings";
import { deleteRecording } from "@/app/lessons/recording-actions";
import { formatBytes, formatDuration } from "@/lib/format";
import { Pill } from "@/components/ui";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { LessonVideo } from "@/components/lesson-video";
import { StreamStatus } from "@/components/stream-status";
import { streamingEnabled } from "@/lib/stream";

/**
 * Lesson videos with playback. Each video is named by its original file
 * name (e.g. IMG_1962.MOV). Teachers (editable) can delete;
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
                  } for good?\n\nThis removes the original full-quality file and the streaming copy, plus its transcript. It can't be undone. The written lesson notes stay.`}
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
