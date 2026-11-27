"use client";

import { useEffect, useRef } from "react";
import { formatBytes } from "@/lib/format";
import { cx } from "@/components/ui";
import { primeKeepAwake } from "@/lib/keep-awake";
import { statusText, useUploads } from "@/components/upload-manager";

// The upload itself runs in UploadProvider (root layout), so it keeps going
// while the teacher opens other pages. This is the lesson page's view of it.
export function RecordingUploader({ lessonId, autoOpen = false }: { lessonId: string; autoOpen?: boolean }) {
  const { items: all, add, retry, dismiss, interrupted, forget } = useUploads();
  const inputRef = useRef<HTMLInputElement>(null);
  const items = all.filter((i) => i.lessonId === lessonId);
  const busy = items.some((i) => ["waiting", "preparing", "uploading", "paused", "saving"].includes(i.state));
  const leftOver = interrupted.filter((u) => u.lessonId === lessonId && !items.some((i) => i.file.size === u.size));

  useEffect(() => {
    if (autoOpen) document.getElementById("recordings")?.scrollIntoView({ behavior: "smooth" });
  }, [autoOpen]);

  function onPick(files: FileList | null) {
    if (!files?.length) return;
    add(lessonId, Array.from(files));
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <div className="flex flex-col gap-3">
      {leftOver.map((u) => (
        <div key={u.size} className="flex flex-col gap-1 border-l-2 border-amber pl-3 text-sm">
          <span>
            <span className="font-medium">{u.fileName}</span> stopped at {Math.floor(u.progress * 100)}% of{" "}
            {formatBytes(u.size)}. Choose the same video again and it carries on from there.
          </span>
          <button type="button" className="self-start text-muted underline" onClick={() => forget(lessonId, u.size)}>
            Never mind
          </button>
        </div>
      ))}

      <label
        onClick={() => primeKeepAwake()}
        className={cx(
          "flex min-h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-accent/40 bg-accent-soft/50 px-4 py-5 text-center transition hover:border-accent",
          busy && "pointer-events-none opacity-60",
        )}
      >
        <span className="text-[16px] font-semibold text-accent-ink">{busy ? "Uploading…" : "Choose lesson video"}</span>
        <span className="text-sm text-muted">
          From this phone or computer. You can pick more than one file. On iPhone and iPad a long video can show
          &ldquo;Preparing&rdquo; for a few minutes before the upload starts.
        </span>
        <input
          ref={inputRef}
          type="file"
          accept="video/*,audio/*,.mov,.mp4,.m4v"
          multiple
          className="sr-only"
          disabled={busy}
          onChange={(e) => onPick(e.target.files)}
        />
      </label>

      {items.length > 0 && (
        <ul className="flex flex-col gap-3">
          {items.map((i) => (
            <li key={i.key}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="truncate font-medium">{i.file.name}</span>
                <span className="shrink-0 text-muted tabular-nums">{statusText(i)}</span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-rule/60">
                <div
                  className={cx(
                    "h-full rounded-full transition-[width]",
                    i.state === "error" ? "bg-danger" : i.state === "done" ? "bg-sage" : i.state === "paused" ? "bg-amber" : "bg-accent",
                  )}
                  style={{ width: `${Math.max(2, i.progress * 100)}%` }}
                />
              </div>
              {i.state === "paused" && (
                <p className="mt-1.5 text-sm text-muted">Paused while the screen was off or the connection dropped. It carries on by itself.</p>
              )}
              {i.state === "error" && (
                <div className="mt-1.5 flex items-center justify-between gap-3 text-sm">
                  <span className="text-danger">{i.error}</span>
                  <span className="flex shrink-0 gap-3">
                    <button type="button" className="text-muted underline" onClick={() => dismiss(i.key)}>
                      Remove
                    </button>
                    <button type="button" className="font-semibold text-accent-ink underline" onClick={() => retry(i.key)}>
                      Retry
                    </button>
                  </span>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {busy && (
        <p className="text-sm text-muted">
          Keep Lesson Studio open on the screen until this finishes. You can move to other pages in Lesson Studio. If you
          switch apps or lock the phone, the upload pauses and carries on from the same spot when you come back.
        </p>
      )}
    </div>
  );
}
