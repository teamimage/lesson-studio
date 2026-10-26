"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import * as tus from "tus-js-client";
import { createClient } from "@/lib/supabase/client";
import { RECORDINGS_BUCKET } from "@/lib/constants";
import { formatBytes } from "@/lib/format";
import { finishRecording, startRecording } from "@/app/lessons/recording-actions";
import { cx } from "@/components/ui";

// Supabase requires 6 MB chunks for resumable uploads.
const CHUNK_SIZE = 6 * 1024 * 1024;

type Item = {
  key: string;
  file: File;
  progress: number;
  state: "waiting" | "uploading" | "done" | "error";
  error?: string;
};

const TYPES_BY_EXTENSION: Record<string, string> = {
  mov: "video/quicktime",
  mp4: "video/mp4",
  m4v: "video/mp4",
  webm: "video/webm",
  m4a: "audio/mp4",
  mp3: "audio/mpeg",
  wav: "audio/wav",
};

function contentType(file: File): string {
  if (file.type) return file.type;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return TYPES_BY_EXTENSION[ext] ?? "video/mp4";
}

// The dedicated storage host handles large uploads better than the API gateway.
function resumableEndpoint(): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(/\/$/, "");
  const direct = base.replace(/^https:\/\/([a-z0-9]+)\.supabase\.co$/, "https://$1.storage.supabase.co");
  return `${direct}/storage/v1/upload/resumable`;
}

// Reads the length of a video in the browser, if the browser can decode it.
function readDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const el = document.createElement(file.type.startsWith("audio") ? "audio" : "video");
    const done = (v: number | null) => {
      URL.revokeObjectURL(url);
      resolve(v);
    };
    const timer = setTimeout(() => done(null), 5000);
    el.preload = "metadata";
    el.onloadedmetadata = () => {
      clearTimeout(timer);
      done(Number.isFinite(el.duration) ? el.duration : null);
    };
    el.onerror = () => {
      clearTimeout(timer);
      done(null);
    };
    el.src = url;
  });
}

export function RecordingUploader({ lessonId, autoOpen = false }: { lessonId: string; autoOpen?: boolean }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Item[]>([]);
  const busy = items.some((i) => i.state === "uploading" || i.state === "waiting");

  // Warn before leaving mid-upload, and keep a phone screen awake while sending.
  useEffect(() => {
    if (!busy) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    let lock: WakeLockSentinel | null = null;
    navigator.wakeLock
      ?.request("screen")
      .then((l) => (lock = l))
      .catch(() => {});
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      lock?.release().catch(() => {});
    };
  }, [busy]);

  useEffect(() => {
    if (autoOpen) document.getElementById("recordings")?.scrollIntoView({ behavior: "smooth" });
  }, [autoOpen]);

  function patch(key: string, change: Partial<Item>) {
    setItems((all) => all.map((i) => (i.key === key ? { ...i, ...change } : i)));
  }

  async function uploadOne(item: Item) {
    const { file, key } = item;
    patch(key, { state: "uploading", progress: 0, error: undefined });
    const type = contentType(file);
    const duration = await readDuration(file);
    const started = await startRecording({
      lessonId,
      fileName: file.name,
      sizeBytes: file.size,
      mimeType: type,
      durationSeconds: duration,
    });
    if ("error" in started) {
      patch(key, { state: "error", error: started.error });
      return;
    }

    const supabase = createClient();
    await new Promise<void>((resolve) => {
      const upload = new tus.Upload(file, {
        endpoint: resumableEndpoint(),
        retryDelays: [0, 2000, 5000, 10000, 20000, 30000, 60000],
        chunkSize: CHUNK_SIZE,
        uploadDataDuringCreation: true,
        removeFingerprintOnSuccess: true,
        headers: {
          apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
          "x-upsert": "true",
        },
        metadata: {
          bucketName: RECORDINGS_BUCKET,
          objectName: started.path,
          contentType: type,
          cacheControl: "3600",
        },
        // A long upload can outlive the access token, so fetch a fresh one each request.
        onBeforeRequest: async (req) => {
          const { data } = await supabase.auth.getSession();
          if (data.session) req.setHeader("authorization", `Bearer ${data.session.access_token}`);
        },
        onProgress: (sent, total) => patch(key, { progress: total ? sent / total : 0 }),
        onError: (err) => {
          const status = (err as tus.DetailedError).originalResponse?.getStatus();
          patch(key, {
            state: "error",
            error:
              status === 413
                ? "This file is larger than the storage limit allows."
                : status === 401 || status === 403
                  ? "Upload wasn't allowed. Sign in again and retry."
                  : "Upload stopped. Check the connection and press Retry; it picks up where it left off.",
          });
          resolve();
        },
        onSuccess: async () => {
          const res = await finishRecording(started.id);
          patch(key, res.ok ? { state: "done", progress: 1 } : { state: "error", error: "Uploaded, but couldn't be saved. Retry." });
          resolve();
        },
      });
      upload.findPreviousUploads().then((previous) => {
        if (previous.length) upload.resumeFromPreviousUpload(previous[0]);
        upload.start();
      });
    });
  }

  async function run(queue: Item[]) {
    for (const item of queue) await uploadOne(item);
    router.refresh();
  }

  function onPick(files: FileList | null) {
    if (!files?.length) return;
    const added: Item[] = Array.from(files).map((file) => ({
      key: `${file.name}-${file.size}-${file.lastModified}-${Math.random()}`,
      file,
      progress: 0,
      state: "waiting",
    }));
    setItems((all) => [...all.filter((i) => i.state !== "done"), ...added]);
    if (inputRef.current) inputRef.current.value = "";
    run(added);
  }

  return (
    <div className="flex flex-col gap-3">
      <label
        className={cx(
          "flex min-h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-accent/40 bg-accent-soft/50 px-4 py-5 text-center transition hover:border-accent",
          busy && "pointer-events-none opacity-60",
        )}
      >
        <span className="text-[15px] font-semibold text-accent-ink">
          {busy ? "Uploading…" : "Choose lesson video"}
        </span>
        <span className="text-sm text-muted">From this phone or computer. You can pick more than one file.</span>
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
        <ul className="flex flex-col gap-2">
          {items.map((i) => (
            <li key={i.key} className="rounded-xl border border-rule bg-sheet px-3 py-2.5">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="truncate font-medium">{i.file.name}</span>
                <span className="shrink-0 text-muted">
                  {i.state === "done"
                    ? "Uploaded"
                    : i.state === "waiting"
                      ? "Waiting"
                      : i.state === "error"
                        ? "Stopped"
                        : `${Math.floor(i.progress * 100)}% of ${formatBytes(i.file.size)}`}
                </span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-rule/60">
                <div
                  className={cx(
                    "h-full rounded-full transition-[width]",
                    i.state === "error" ? "bg-danger" : i.state === "done" ? "bg-sage" : "bg-accent",
                  )}
                  style={{ width: `${Math.max(2, i.progress * 100)}%` }}
                />
              </div>
              {i.state === "error" && (
                <div className="mt-2 flex items-center justify-between gap-3 text-sm">
                  <span className="text-danger">{i.error}</span>
                  <button
                    type="button"
                    className="shrink-0 font-semibold text-accent-ink underline"
                    disabled={busy}
                    onClick={() => run([i])}
                  >
                    Retry
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {busy && (
        <p className="text-sm text-muted">
          Keep this page open until it finishes. If the connection drops, Retry continues from where it stopped.
        </p>
      )}
    </div>
  );
}
