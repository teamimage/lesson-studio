"use client";

import { Suspense, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import * as tus from "tus-js-client";
import { createClient } from "@/lib/supabase/client";
import { RECORDINGS_BUCKET } from "@/lib/constants";
import { formatBytes } from "@/lib/format";
import { finishRecording, startRecording } from "@/app/lessons/recording-actions";
import { readVideoStartTime } from "@/lib/video-start-time";
import { keepAwake, primeKeepAwake } from "@/lib/keep-awake";

/*
 * Lesson video uploads live here, above every page, so an upload keeps going
 * while the teacher moves around Lesson Studio. The lesson page only shows
 * and starts them.
 *
 * What keeps a long upload alive on an iPhone or iPad:
 * - the screen is held awake while anything is uploading (keep-awake.ts);
 * - uploads are resumable in 6 MB pieces, so a dropped connection, a locked
 *   phone or a closed tab costs at most one piece, not the whole file;
 * - when the page comes back (unlocked, back from another app, back online)
 *   a paused upload carries on by itself, no Retry needed;
 * - if iOS throws the page away, the lesson page remembers the upload and
 *   asks for the same video again, then continues from where it stopped.
 */

// Supabase requires 6 MB chunks for resumable uploads.
const CHUNK_SIZE = 6 * 1024 * 1024;
// While the page is visible, keep retrying for about 10 minutes before
// saying it stopped; hidden pages pause instead and resume on return.
const RETRY_DELAYS = [0, 2000, 5000, 10000, 15000, 20000, 30000, 30000, 60000, 60000, 60000, 60000, 60000, 60000, 60000];
const INTERRUPTED_KEY = "ls-interrupted-uploads";

export type UploadState = "waiting" | "preparing" | "uploading" | "paused" | "saving" | "done" | "error";

export type UploadItem = {
  key: string;
  lessonId: string;
  file: File;
  progress: number;
  state: UploadState;
  error?: string;
  /** Bytes per second, smoothed. */
  speed?: number;
  recording?: { id: string; path: string };
  /** The file reached storage; only the "save" step is left. */
  uploaded?: boolean;
  /** A connection problem: try again by itself when the page is back. */
  retryable?: boolean;
};

export type InterruptedUpload = { lessonId: string; fileName: string; size: number; progress: number; at: number };

type Ctx = {
  items: UploadItem[];
  add: (lessonId: string, files: File[]) => void;
  retry: (key: string) => void;
  dismiss: (key: string) => void;
  interrupted: InterruptedUpload[];
  forget: (lessonId: string, size: number) => void;
};

const UploadContext = createContext<Ctx | null>(null);

export function useUploads(): Ctx {
  const ctx = useContext(UploadContext);
  if (!ctx) throw new Error("useUploads needs UploadProvider");
  return ctx;
}

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

function readInterrupted(): InterruptedUpload[] {
  try {
    const list = JSON.parse(localStorage.getItem(INTERRUPTED_KEY) ?? "[]") as InterruptedUpload[];
    // Supabase keeps a half-finished upload for 24 hours.
    return Array.isArray(list) ? list.filter((u) => Date.now() - u.at < 23 * 3600 * 1000) : [];
  } catch {
    return [];
  }
}

function writeInterrupted(list: InterruptedUpload[]) {
  try {
    localStorage.setItem(INTERRUPTED_KEY, JSON.stringify(list));
  } catch {}
}

function remember(u: InterruptedUpload) {
  writeInterrupted([...readInterrupted().filter((x) => !(x.lessonId === u.lessonId && x.size === u.size)), u]);
}

function unremember(lessonId: string, size: number) {
  writeInterrupted(readInterrupted().filter((x) => !(x.lessonId === lessonId && x.size === size)));
}

export function timeLeft(item: UploadItem): string | null {
  if (item.state !== "uploading" || !item.speed || item.progress < 0.01) return null;
  const secs = ((1 - item.progress) * item.file.size) / item.speed;
  if (!Number.isFinite(secs)) return null;
  if (secs < 60) return "under a minute left";
  const mins = Math.round(secs / 60);
  if (mins < 90) return `about ${mins} min left`;
  return `about ${Math.round(mins / 6) / 10} hours left`;
}

export function statusText(i: UploadItem): string {
  switch (i.state) {
    case "waiting":
      return "Waiting";
    case "preparing":
      return "Getting ready…";
    case "saving":
      return "Saving…";
    case "done":
      return "Uploaded";
    case "paused":
      return `Paused at ${Math.floor(i.progress * 100)}%`;
    case "error":
      return "Stopped";
    default: {
      const left = timeLeft(i);
      return `${Math.floor(i.progress * 100)}% of ${formatBytes(i.file.size)}${left ? ` · ${left}` : ""}`;
    }
  }
}

export function UploadProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [items, setItems] = useState<UploadItem[]>([]);
  const [interrupted, setInterrupted] = useState<InterruptedUpload[]>([]);
  const itemsRef = useRef<UploadItem[]>([]);
  const running = useRef(false);
  const current = useRef<{ key: string; upload: tus.Upload; stop: () => void } | null>(null);

  // Read after hydration so the server and first client render match.
  useEffect(() => {
    const t = setTimeout(() => setInterrupted(readInterrupted()), 0);
    return () => clearTimeout(t);
  }, []);

  // The ref is the source of truth and is updated straight away, so the
  // queue sees a change at once. (Updating it inside a setItems callback
  // left new uploads stuck on "Waiting": React runs that callback later.)
  const commit = useCallback((next: UploadItem[]) => {
    itemsRef.current = next;
    setItems(next);
  }, []);

  const patch = useCallback(
    (key: string, change: Partial<UploadItem>) => {
      commit(itemsRef.current.map((i) => (i.key === key ? { ...i, ...change } : i)));
    },
    [commit],
  );

  const busy = items.some((i) => ["waiting", "preparing", "uploading", "paused", "saving"].includes(i.state));

  // Keep the screen awake and warn before closing while anything is moving.
  useEffect(() => {
    if (!busy) return;
    const release = keepAwake();
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      release();
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [busy]);

  const uploadOne = useCallback(
    async (key: string) => {
      const item = itemsRef.current.find((i) => i.key === key);
      if (!item) return;
      const { file, lessonId } = item;
      const type = contentType(file);

      let recording = item.recording;
      if (!recording) {
        patch(key, { state: "preparing", error: undefined });
        const [duration, startedAt] = await Promise.all([readDuration(file), readVideoStartTime(file)]);
        const started = await startRecording({
          lessonId,
          fileName: file.name,
          sizeBytes: file.size,
          mimeType: type,
          durationSeconds: duration,
          startedAt: startedAt?.toISOString() ?? null,
        }).catch(() => ({ error: "Couldn't reach Lesson Studio. Check the connection and press Retry." }));
        if ("error" in started) {
          patch(key, { state: "error", error: started.error, retryable: true });
          return;
        }
        recording = { id: started.id, path: started.path };
        patch(key, { recording });
      }

      const save = async () => {
        patch(key, { state: "saving", progress: 1, uploaded: true });
        const res = await finishRecording(recording.id).catch(() => ({ ok: false }));
        if (res.ok) {
          unremember(lessonId, file.size);
          setInterrupted(readInterrupted());
          patch(key, { state: "done", progress: 1 });
          router.refresh();
        } else {
          patch(key, {
            state: "error",
            retryable: true,
            error: "Uploaded, but couldn't be saved. Press Retry (it won't upload again).",
          });
        }
      };

      if (item.uploaded) return save();

      patch(key, { state: "uploading", error: undefined, retryable: false });
      remember({ lessonId, fileName: file.name, size: file.size, progress: item.progress, at: Date.now() });
      const supabase = createClient();
      let last = { t: performance.now(), bytes: 0 };
      let lastSaved = 0;

      let lastMove = Date.now();
      let watchdog: ReturnType<typeof setInterval> | null = null;
      await new Promise<void>((outerResolve) => {
        let settled = false;
        const resolve = () => {
          if (settled) return;
          settled = true;
          if (watchdog) clearInterval(watchdog);
          outerResolve();
        };
        const upload = new tus.Upload(file, {
          endpoint: resumableEndpoint(),
          retryDelays: RETRY_DELAYS,
          chunkSize: CHUNK_SIZE,
          uploadDataDuringCreation: true,
          removeFingerprintOnSuccess: true,
          // Lesson + size identifies the video even if iOS hands it over
          // under a new name or date when it is picked again.
          fingerprint: async () => `ls-recording:${lessonId}:${file.size}`,
          headers: {
            apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
            "x-upsert": "true",
          },
          metadata: {
            bucketName: RECORDINGS_BUCKET,
            objectName: recording.path,
            contentType: type,
            cacheControl: "3600",
          },
          // A long upload can outlive the access token, so fetch a fresh one each request.
          onBeforeRequest: async (req) => {
            const { data } = await supabase.auth.getSession();
            if (data.session) req.setHeader("authorization", `Bearer ${data.session.access_token}`);
          },
          // A hidden (locked or backgrounded) page can't send, so don't burn
          // retries on it; it pauses and resumes when the page is back.
          onShouldRetry: (err) => {
            const status = (err as tus.DetailedError).originalResponse?.getStatus() ?? 0;
            if (document.visibilityState === "hidden") return false;
            return status === 0 || status === 409 || status === 423 || status >= 500 || status === 429;
          },
          onProgress: (sent, total) => {
            lastMove = Date.now();
            const now = performance.now();
            const dt = (now - last.t) / 1000;
            const cur = itemsRef.current.find((i) => i.key === key);
            let speed = cur?.speed;
            if (dt >= 2 && sent > last.bytes) {
              const rate = (sent - last.bytes) / dt;
              speed = speed ? speed * 0.7 + rate * 0.3 : rate;
              last = { t: now, bytes: sent };
            } else if (sent < last.bytes) {
              last = { t: now, bytes: sent };
            }
            const progress = total ? sent / total : 0;
            patch(key, { progress, speed, state: "uploading" });
            if (now - lastSaved > 5000) {
              lastSaved = now;
              remember({ lessonId, fileName: file.name, size: file.size, progress, at: Date.now() });
            }
          },
          onError: (err) => {
            current.current = null;
            const status = (err as tus.DetailedError).originalResponse?.getStatus();
            if (status === 413) {
              patch(key, { state: "error", error: "This file is larger than the storage limit allows." });
            } else if (status === 401 || status === 403) {
              patch(key, { state: "error", error: "Upload wasn't allowed. Sign in again and press Retry." });
            } else if (document.visibilityState === "hidden" || !navigator.onLine) {
              patch(key, { state: "paused", error: undefined });
            } else {
              patch(key, {
                state: "error",
                retryable: true,
                error: "Upload stopped. Check the connection and press Retry; it picks up where it left off.",
              });
            }
            resolve();
          },
          onSuccess: async () => {
            current.current = null;
            await save();
            resolve();
          },
        });
        current.current = { key, upload, stop: resolve };
        upload
          .findPreviousUploads()
          .then((previous) => {
            if (previous.length) upload.resumeFromPreviousUpload(previous[0]);
          })
          .catch(() => {})
          .finally(() => upload.start());
        // If nothing moves for 2 minutes while the page is on screen, the
        // connection is stuck without an error: stop and pick up again.
        watchdog = setInterval(() => {
          if (document.visibilityState !== "visible") {
            lastMove = Date.now();
            return;
          }
          if (Date.now() - lastMove < 120_000) return;
          void upload.abort();
          current.current = null;
          patch(key, { state: "waiting" });
          resolve();
        }, 15_000);
      });
    },
    [patch, router],
  );

  // Runs waiting uploads one at a time.
  const pump = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    try {
      for (;;) {
        const next = itemsRef.current.find((i) => i.state === "waiting");
        if (!next) break;
        await uploadOne(next.key);
      }
    } finally {
      running.current = false;
    }
  }, [uploadOne]);

  const add = useCallback(
    (lessonId: string, files: File[]) => {
      // The same video already on its way: leave it running.
      const moving = (f: File) =>
        itemsRef.current.some(
          (i) => i.lessonId === lessonId && i.file.size === f.size && !["done", "error"].includes(i.state),
        );
      files = files.filter((f) => !moving(f));
      if (!files.length) return;
      const added: UploadItem[] = files.map((file) => ({
        key: `${lessonId}-${file.size}-${Math.random()}`,
        lessonId,
        file,
        progress: interrupted.find((u) => u.lessonId === lessonId && u.size === file.size)?.progress ?? 0,
        state: "waiting",
      }));
      commit([
        ...itemsRef.current.filter(
          (i) => i.state !== "done" && !added.some((a) => a.lessonId === i.lessonId && a.file.size === i.file.size),
        ),
        ...added,
      ]);
      void pump();
    },
    [commit, interrupted, pump],
  );

  const retry = useCallback(
    (key: string) => {
      primeKeepAwake();
      patch(key, { state: "waiting", error: undefined });
      void pump();
    },
    [patch, pump],
  );

  const dismiss = useCallback((key: string) => {
    if (current.current?.key === key) {
      // abort() fires no callback, so let the queue move on ourselves.
      void current.current.upload.abort();
      current.current.stop();
      current.current = null;
    }
    commit(itemsRef.current.filter((i) => i.key !== key));
  }, [commit]);

  // Safety net: anything left waiting gets started.
  useEffect(() => {
    if (items.some((i) => i.state === "waiting") && !running.current) void pump();
  }, [items, pump]);

  const forget = useCallback((lessonId: string, size: number) => {
    unremember(lessonId, size);
    setInterrupted(readInterrupted());
  }, []);

  // Back from a locked screen, another app, or a dropped connection:
  // carry on by itself.
  useEffect(() => {
    const resume = () => {
      if (document.visibilityState !== "visible" || !navigator.onLine) return;
      const stalled = itemsRef.current.filter((i) => i.state === "paused" || (i.state === "error" && i.retryable));
      if (!stalled.length) return;
      for (const i of stalled) patch(i.key, { state: "waiting", error: undefined });
      void pump();
    };
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("online", resume);
    window.addEventListener("pageshow", resume);
    return () => {
      document.removeEventListener("visibilitychange", resume);
      window.removeEventListener("online", resume);
      window.removeEventListener("pageshow", resume);
    };
  }, [patch, pump]);

  const value = useMemo(
    () => ({ items, add, retry, dismiss, interrupted, forget }),
    [items, add, retry, dismiss, interrupted, forget],
  );

  return (
    <UploadContext.Provider value={value}>
      {children}
      <Suspense fallback={null}>
        <UploadBadge items={items} />
      </Suspense>
    </UploadContext.Provider>
  );
}

/** A small line at the bottom of other pages while a lesson video uploads. */
function UploadBadge({ items }: { items: UploadItem[] }) {
  const pathname = usePathname();
  const shown = items.filter((i) => i.state !== "done" && !pathname.startsWith(`/v3/lessons/${i.lessonId}`));
  if (!shown.length) return null;
  const first = shown[0];
  const stuck = first.state === "error";
  return (
    <Link
      href={`/v3/lessons/${first.lessonId}#recordings`}
      className="fixed inset-x-3 z-50 mx-auto flex max-w-md items-center gap-3 rounded-full bg-ink px-4 py-2 text-sm text-paper shadow-lg"
      style={{ bottom: "calc(env(safe-area-inset-bottom) + 12px)" }}
    >
      <span>{stuck ? "Upload stopped" : "Uploading video"}</span>
      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-paper/25">
        <span className="block h-full rounded-full bg-paper" style={{ width: `${Math.max(2, first.progress * 100)}%` }} />
      </span>
      <span className="shrink-0 tabular-nums">{stuck ? "Open" : `${Math.floor(first.progress * 100)}%`}</span>
    </Link>
  );
}
