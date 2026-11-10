"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { detectSheet } from "@/lib/digitize-page";

type Quad = [number, number][];

/** True when this browser can show a live camera (otherwise the plain photo picker is used). */
export function canUseLiveCamera(): boolean {
  return typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
}

const STEADY_FRAMES = 5; // ~1 s of the page holding still before the photo is taken
const TICK_MS = 200;

function moved(a: Quad, b: Quad): number {
  return Math.max(...a.map((p, i) => Math.hypot(p[0] - b[i][0], p[1] - b[i][1])));
}

/** A tiny grey copy of the frame, to tell a new page from the one just taken. */
function thumb(video: HTMLVideoElement): Uint8ClampedArray {
  const c = document.createElement("canvas");
  c.width = 24;
  c.height = 32;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(video, 0, 0, 24, 32);
  const d = ctx.getImageData(0, 0, 24, 32).data;
  const out = new Uint8ClampedArray(24 * 32);
  for (let i = 0; i < out.length; i++) out[i] = (d[i * 4] + d[i * 4 + 1] + d[i * 4 + 2]) / 3;
  return out;
}

function differs(a: Uint8ClampedArray, b: Uint8ClampedArray): boolean {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]);
  return s / a.length > 10;
}

/**
 * Full-screen camera with a guide like a bank app's cheque scanner: the
 * frame follows the sheet and turns green when all four corners are in view
 * and the camera is steady, then the photo is taken by itself. After each
 * page it asks whether there are more pages.
 */
export function CameraCapture({
  onDone,
  onCancel,
  onUnavailable,
}: {
  onDone: (files: File[]) => void;
  onCancel: () => void;
  /** The camera couldn't be opened (no permission, no camera): use the photo picker instead. */
  onUnavailable: () => void;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [quad, setQuad] = useState<Quad | null>(null);
  const [steady, setSteady] = useState(0);
  const [asking, setAsking] = useState(false);
  const [flash, setFlash] = useState(false);
  const [shots, setShots] = useState<File[]>([]);
  const last = useRef<{ quad: Quad | null; steady: number; shot: Uint8ClampedArray | null; busy: boolean }>({
    quad: null,
    steady: 0,
    shot: null,
    busy: false,
  });

  // Open the back camera.
  useEffect(() => {
    let stream: MediaStream | null = null;
    let stopped = false;
    navigator.mediaDevices
      .getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 4096 }, height: { ideal: 3072 } },
        audio: false,
      })
      .then(async (s) => {
        if (stopped) return s.getTracks().forEach((t) => t.stop());
        stream = s;
        const v = video.current;
        if (!v) return;
        v.srcObject = s;
        await v.play().catch(() => {});
      })
      .catch(() => onUnavailable());
    return () => {
      stopped = true;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onUnavailable]);

  const take = useCallback(async () => {
    const v = video.current;
    if (!v || !v.videoWidth || last.current.busy) return;
    last.current.busy = true;
    const c = document.createElement("canvas");
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    c.getContext("2d")!.drawImage(v, 0, 0);
    last.current.shot = thumb(v);
    setFlash(true);
    setTimeout(() => setFlash(false), 180);
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.92));
    last.current.busy = false;
    if (!blob) return;
    setShots((s) => [...s, new File([blob], `page-${s.length + 1}.jpg`, { type: "image/jpeg", lastModified: Date.now() })]);
    last.current.steady = 0;
    setSteady(0);
    setAsking(true);
  }, []);

  // Follow the sheet a few times a second.
  useEffect(() => {
    if (asking) return;
    const t = setInterval(() => {
      const v = video.current;
      if (!v || v.readyState < 2 || !v.videoWidth || last.current.busy) return;
      if (!size || size.w !== v.videoWidth || size.h !== v.videoHeight) setSize({ w: v.videoWidth, h: v.videoHeight });
      const q = detectSheet(v, v.videoWidth, v.videoHeight);
      const prev = last.current.quad;
      last.current.quad = q;
      setQuad(q);
      const still = !!q && !!prev && moved(q, prev) < 0.015;
      last.current.steady = still ? last.current.steady + 1 : 0;
      setSteady(last.current.steady);
      if (last.current.steady >= STEADY_FRAMES) {
        // Don't take the same page twice: wait until something new is in front of the camera.
        if (last.current.shot && !differs(thumb(v), last.current.shot)) return;
        take();
      }
    }, TICK_MS);
    return () => clearInterval(t);
  }, [asking, size, take]);

  const ready = !!quad && steady >= 2;
  const hint = !quad
    ? "Fit the whole page in the frame, with a little of the table around it. A darker surface under the page helps."
    : ready
      ? "Hold still…"
      : "Hold the camera steady over the page.";

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black text-white">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <button type="button" onClick={onCancel} className="min-h-10 rounded-xl bg-white/10 px-3 text-sm">
          Cancel
        </button>
        <span className="text-sm text-white/80">
          {shots.length ? `${shots.length} page${shots.length === 1 ? "" : "s"} taken` : "Page 1"}
        </span>
        <button
          type="button"
          onClick={() => onDone(shots)}
          disabled={!shots.length}
          className="min-h-10 rounded-xl bg-white/10 px-3 text-sm disabled:opacity-40"
        >
          Done
        </button>
      </div>

      <div className="relative min-h-0 flex-1">
        <video ref={video} playsInline muted autoPlay className="absolute inset-0 h-full w-full object-contain" />
        {size && (
          <svg
            viewBox={`0 0 ${size.w} ${size.h}`}
            preserveAspectRatio="xMidYMid meet"
            className="pointer-events-none absolute inset-0 h-full w-full"
          >
            {quad ? (
              <polygon
                points={quad.map(([x, y]) => `${x * size.w},${y * size.h}`).join(" ")}
                fill={ready ? "rgba(34,197,94,0.18)" : "rgba(245,158,11,0.12)"}
                stroke={ready ? "#22c55e" : "#f59e0b"}
                strokeWidth={Math.max(size.w, size.h) / 160}
                strokeLinejoin="round"
              />
            ) : (
              <rect
                x={size.w * 0.08}
                y={size.h * 0.06}
                width={size.w * 0.84}
                height={size.h * 0.88}
                fill="none"
                stroke="rgba(255,255,255,0.6)"
                strokeDasharray={`${size.w / 40} ${size.w / 60}`}
                strokeWidth={Math.max(size.w, size.h) / 260}
              />
            )}
          </svg>
        )}
        {flash && <div className="absolute inset-0 bg-white/80" />}
        {!asking && (
          <p className="absolute inset-x-4 bottom-4 rounded-xl bg-black/60 px-3 py-2 text-center text-sm">{hint}</p>
        )}
        {asking && (
          <div className="absolute inset-x-4 bottom-4 flex flex-col gap-3 rounded-2xl bg-paper p-4 text-ink shadow-xl">
            <p className="text-[16px] font-semibold">Do you have any more pages to add to this piece of music?</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setAsking(false)}
                className="min-h-11 rounded-xl border border-rule bg-sheet font-semibold text-ink"
              >
                Yes, next page
              </button>
              <button
                type="button"
                onClick={() => onDone(shots)}
                className="min-h-11 rounded-xl bg-accent font-semibold text-white"
              >
                No, that&apos;s all
              </button>
            </div>
          </div>
        )}
      </div>

      {!asking && (
        <div className="flex items-center justify-center py-4">
          <button
            type="button"
            onClick={take}
            aria-label="Take the photo now"
            className="h-16 w-16 rounded-full border-4 border-white bg-white/20 active:bg-white/60"
          />
        </div>
      )}
    </div>
  );
}
