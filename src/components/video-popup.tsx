"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { LessonVideo } from "@/components/lesson-video";
import { cx } from "@/components/ui";
import { formatClock, type Jump } from "@/lib/lesson-moments";

export type PopupRecording = {
  id: string;
  url: string | null;
  streamReady: boolean;
  name: string;
};

type Ctx = {
  open: (jump: Jump) => void;
  canPlay: (recordingId: string) => boolean;
};
const VideoPopupContext = createContext<Ctx | null>(null);

/**
 * Wraps a page whose rows jump into the lesson video. Opening a jump shows
 * the video in a popup over the page, started at that moment (streaming copy
 * when there is one, else the original file).
 */
export function VideoPopupProvider({ recordings, children }: { recordings: PopupRecording[]; children: ReactNode }) {
  const [jump, setJump] = useState<Jump | null>(null);
  const [nonce, setNonce] = useState(0);
  const byId = new Map(recordings.filter((r) => r.url).map((r) => [r.id, r]));

  const open = useCallback((j: Jump) => {
    setJump(j);
    setNonce((n) => n + 1);
  }, []);
  const canPlay = useCallback((id: string) => recordings.some((r) => r.id === id && r.url), [recordings]);
  const rec = jump ? byId.get(jump.recordingId) : undefined;

  return (
    <VideoPopupContext.Provider value={{ open, canPlay }}>
      {children}
      {jump && rec && <Popup rec={rec} jump={jump} nonce={nonce} onClose={() => setJump(null)} />}
    </VideoPopupContext.Provider>
  );
}

export function useVideoPopup(): Ctx | null {
  return useContext(VideoPopupContext);
}

/** A small "▶ 4:10" button that opens the popup player at a moment. */
export function JumpButton({ jump, className, children }: { jump: Jump; className?: string; children?: ReactNode }) {
  const popup = useVideoPopup();
  if (!popup?.canPlay(jump.recordingId)) return null;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        popup.open(jump);
      }}
      className={cx(
        "inline-flex min-h-8 shrink-0 items-center gap-1 rounded-lg border border-rule bg-paper px-2 text-xs font-semibold tabular-nums text-accent-ink",
        className,
      )}
      aria-label={`Play the video at ${formatClock(jump.seconds)}`}
    >
      {children ?? <>▶ {formatClock(jump.seconds)}</>}
    </button>
  );
}

function Popup({ rec, jump, nonce, onClose }: { rec: PopupRecording; jump: Jump; nonce: number; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const ready = useRef(false);
  const [time, setTime] = useState(jump.seconds);

  // A new jump while the same video is already loaded: just seek.
  useEffect(() => {
    const v = videoRef.current;
    if (v && ready.current) {
      v.currentTime = jump.seconds;
      void v.play().catch(() => {});
    }
  }, [jump.seconds, nonce]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  const nudge = (d: number) => {
    const v = videoRef.current;
    if (v) v.currentTime = Math.max(0, v.currentTime + d);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={jump.label}
    >
      <div
        className="flex w-full max-w-4xl flex-col overflow-hidden rounded-t-2xl bg-neutral-950 text-white shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-3 py-2 text-sm">
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold">{jump.label}</div>
            <div className="truncate text-xs text-white/60">
              {rec.name} · from {formatClock(jump.seconds)}
            </div>
          </div>
          <button
            onClick={onClose}
            className="min-h-9 rounded-lg px-3 text-lg leading-none text-white/80"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <LessonVideo
          key={rec.id}
          ref={videoRef}
          recordingId={rec.id}
          src={rec.url!}
          streamReady={rec.streamReady}
          controls
          autoPlay
          playsInline
          preload="auto"
          className="aspect-video max-h-[70vh] w-full bg-black"
          onLoadedMetadata={(e) => {
            const v = e.currentTarget;
            if (!ready.current) {
              ready.current = true;
              v.currentTime = jump.seconds;
              void v.play().catch(() => {});
            }
          }}
          onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
        />
        <div className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
          <button onClick={() => nudge(-10)} className="min-h-9 rounded-lg bg-white/10 px-3">
            ↺ 10s
          </button>
          <button
            onClick={() => {
              const v = videoRef.current;
              if (!v) return;
              v.currentTime = jump.seconds;
              void v.play().catch(() => {});
            }}
            className="min-h-9 rounded-lg bg-white/10 px-3"
          >
            Back to {formatClock(jump.seconds)}
          </button>
          <button onClick={() => nudge(10)} className="min-h-9 rounded-lg bg-white/10 px-3">
            10s ↻
          </button>
          <a
            href={`/recordings/${rec.id}/full?t=${Math.floor(time)}`}
            target="_blank"
            rel="noreferrer"
            className="ml-auto text-white/80 underline"
          >
            Full quality
          </a>
        </div>
      </div>
    </div>
  );
}
