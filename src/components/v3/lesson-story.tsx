"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { AngleVideo, angleShift, openingAngle } from "@/components/angle-video";
import { MusicPanel, type ViewerScore } from "@/components/score-viewer";
import { VideoPopupContext, type PopupRecording } from "@/components/video-popup";
import { cx } from "@/components/ui";
import { formatClock, parseClock, type Jump, type Moment } from "@/lib/lesson-moments";
import { musicTag } from "@/lib/music-links";

// Version 3 lesson page: the video sits beside (iPad, computer) or above
// (phone) one scrolling story. Tapping any moment, or any ▶ button in the
// notes, plays that clip in place and shows its bars. No popup.

type Now = { jump: Jump | null; time: number; recordingId: string | null; play: (j: Jump) => void };
const StoryNow = createContext<Now | null>(null);

export function LessonStoryProvider({
  recordings,
  scores,
  studentId,
  children,
}: {
  recordings: PopupRecording[];
  scores: ViewerScore[];
  studentId: string;
  children: ReactNode;
}) {
  const angles = useMemo(() => recordings.filter((r) => !!r.url || r.streamReady), [recordings]);
  const main = angles.find((a) => a.isMain) ?? angles[0] ?? null;
  const [jump, setJump] = useState<Jump | null>(null);
  const [angleId, setAngleId] = useState<string | null>(main?.id ?? null);
  const [time, setTime] = useState(0);
  const [stopAt, setStopAt] = useState<number | null>(null);
  const [ended, setEnded] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const playerRef = useRef<HTMLDivElement>(null);
  const angle = angles.find((a) => a.id === angleId) ?? main;

  const seekPlay = useCallback((seconds: number) => {
    const v = videoRef.current;
    if (!v) return;
    const go = () => {
      v.currentTime = Math.max(0, seconds);
      void v.play().catch(() => {});
    };
    if (v.readyState >= 1) go();
    else v.addEventListener("loadedmetadata", go, { once: true });
  }, []);

  const play = useCallback(
    (j: Jump) => {
      const from = angles.find((a) => a.id === j.recordingId);
      if (!from) return;
      const id = openingAngle(angles, from.id, j.seconds);
      const to = angles.find((a) => a.id === id) ?? from;
      const shift = angleShift(from, to) ?? 0;
      setJump(j);
      setAngleId(to.id);
      setEnded(false);
      setStopAt(j.endSeconds == null ? null : j.endSeconds + shift);
      // Let the angle switch render, then seek.
      requestAnimationFrame(() => seekPlay(j.seconds + shift));
      // On a phone the player is above the story: bring it into view.
      const el = playerRef.current;
      if (el && el.getBoundingClientRect().top < 0) el.scrollIntoView({ block: "start", behavior: "smooth" });
    },
    [angles, seekPlay],
  );

  const canPlay = useCallback((id: string) => angles.some((a) => a.id === id), [angles]);
  // Time in the jump's own video, so story rows can light up while it plays.
  const jumpFrom = jump ? angles.find((a) => a.id === jump.recordingId) : null;
  const backShift = jumpFrom && angle ? (angleShift(angle, jumpFrom) ?? 0) : 0;
  const storyTime = time + backShift;
  const score = jump?.music ? scores.find((s) => s.id === jump.music!.scoreId) : undefined;

  if (!angle) {
    return (
      <VideoPopupContext.Provider value={{ open: () => {}, canPlay: () => false }}>
        <StoryNow.Provider value={{ jump: null, time: 0, recordingId: null, play: () => {} }}>{children}</StoryNow.Provider>
      </VideoPopupContext.Provider>
    );
  }

  return (
    <VideoPopupContext.Provider value={{ open: play, canPlay }}>
      <StoryNow.Provider value={{ jump, time: storyTime, recordingId: jump?.recordingId ?? angle.id, play }}>
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,6fr)_minmax(0,5fr)]">
          <div
            ref={playerRef}
            className="sticky top-24 z-[6] -mx-4 flex scroll-mt-24 flex-col bg-paper sm:mx-0 lg:top-28 lg:order-2"
          >
            <div className="overflow-hidden bg-black sm:rounded-2xl">
              <AngleVideo
                angles={angles}
                current={angle.id}
                onSwitch={setAngleId}
                videoRef={videoRef}
                tone="dark"
                className="aspect-video max-h-[32vh] w-full bg-black lg:max-h-[50vh]"
                onTimeUpdate={(e) => {
                  const v = e.currentTarget;
                  setTime(v.currentTime);
                  if (stopAt !== null && !ended && v.currentTime >= stopAt) {
                    v.pause();
                    setEnded(true);
                  }
                }}
              >
                {ended && jump && (
                  <div className="absolute inset-x-0 bottom-12 flex justify-center gap-2 px-3">
                    <button
                      onClick={() => play(jump)}
                      className="min-h-10 rounded-xl bg-white/90 px-4 text-sm font-semibold text-black"
                    >
                      ↺ Replay clip
                    </button>
                    <button
                      onClick={() => {
                        setStopAt(null);
                        setEnded(false);
                        void videoRef.current?.play().catch(() => {});
                      }}
                      className="min-h-10 rounded-xl bg-white/20 px-4 text-sm font-semibold text-white backdrop-blur"
                    >
                      Keep playing ▶
                    </button>
                  </div>
                )}
              </AngleVideo>
            </div>
            <div className="flex items-center gap-2 px-4 py-1.5 text-sm sm:px-1">
              <span className="min-w-0 flex-1 truncate">
                {jump ? (
                  <>
                    <span className="font-semibold">{jump.label}</span>{" "}
                    <span className="text-muted tabular-nums">
                      {formatClock(jump.seconds)}
                      {jump.endSeconds != null ? `–${formatClock(jump.endSeconds)}` : ""}
                    </span>
                  </>
                ) : (
                  <span className="text-muted">Tap any moment in the story to play it here.</span>
                )}
              </span>
              <button
                type="button"
                onClick={() => {
                  const v = videoRef.current;
                  if (v) v.currentTime = Math.max(0, v.currentTime - 10);
                }}
                className="min-h-9 shrink-0 rounded-lg border border-rule bg-sheet px-2.5"
              >
                ↺ 10s
              </button>
            </div>
            {score && jump?.music && (
              <div className="hidden h-[38vh] flex-col overflow-hidden rounded-2xl lg:flex">
                <MusicPanel key={`${jump.music.scoreId}-${jump.music.page}-${jump.seconds}`} music={jump.music} score={score} studentId={studentId} />
              </div>
            )}
          </div>
          {/* Phones: the bars show under the moment that was tapped (see StoryMoments). */}
          <div className="flex min-w-0 flex-col gap-5 lg:order-1">{children}</div>
        </div>
      </StoryNow.Provider>
    </VideoPopupContext.Provider>
  );
}

type TranscriptLine = { seconds: number; text: string };

function parseTranscript(text: string | null): TranscriptLine[] {
  if (!text) return [];
  const out: TranscriptLine[] = [];
  for (const line of text.split("\n")) {
    const m = line.match(/^\[((?:\d+:)?\d{1,3}:\d{2})(?:[–-][^\]]*)?\]\s*(.*)$/);
    if (!m) continue;
    const s = parseClock(m[1]);
    if (s !== null && m[2].trim()) out.push({ seconds: s, text: m[2].trim() });
  }
  return out;
}

const TAG = {
  piece: { text: "Piece", className: "bg-accent-soft text-accent-ink" },
  mark: { text: "Bars", className: "bg-amber-soft text-amber" },
  ai: { text: "Note", className: "bg-plum-soft text-plum" },
} as const;

/**
 * The lesson moment by moment: each moment (piece opened, bars marked, or a
 * note the AI found) with what it was about and what was said, in order.
 * The one playing is highlighted; tapping one plays it.
 */
export function StoryMoments({
  moments,
  transcript,
  transcriptRecordingId,
  scores,
  studentId,
  multiVideo,
}: {
  moments: Moment[];
  transcript: string | null;
  transcriptRecordingId: string | null;
  scores: ViewerScore[];
  studentId: string;
  multiVideo?: Record<string, string>;
}) {
  const now = useContext(StoryNow);
  const lines = useMemo(() => parseTranscript(transcript), [transcript]);
  const playingId = now?.jump
    ? moments.find(
        (m) =>
          m.recordingId === now.recordingId &&
          now.time >= m.seconds - 0.5 &&
          (m.endSeconds == null || now.time < m.endSeconds),
      )?.id
    : undefined;

  return (
    <ol className="flex flex-col gap-2.5">
      {moments.map((m, i) => {
        const end = m.endSeconds ?? moments.find((n, j) => j > i && n.recordingId === m.recordingId)?.seconds ?? null;
        const said =
          m.recordingId === transcriptRecordingId
            ? lines.filter((l) => l.seconds >= m.seconds && (end == null || l.seconds < end))
            : [];
        const on = playingId === m.id;
        const score = m.music ? scores.find((s) => s.id === m.music!.scoreId) : undefined;
        const summary = (m.summary ?? []).filter(Boolean);
        return (
          <li
            key={m.id}
            className={cx(
              "rounded-2xl border bg-sheet transition-colors",
              on ? "border-accent ring-2 ring-accent/30" : "border-rule",
            )}
          >
            <button
              type="button"
              onClick={() => now?.play(m)}
              className="flex w-full items-start gap-3 px-4 py-3 text-left"
            >
              <span
                className={cx(
                  "mt-0.5 flex h-9 min-w-14 shrink-0 items-center justify-center rounded-xl text-sm font-semibold tabular-nums",
                  on ? "bg-accent text-white" : "bg-accent-soft text-accent-ink",
                )}
              >
                ▶ {formatClock(m.seconds)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className={cx("rounded px-1.5 text-[11px] font-semibold uppercase tracking-wide", TAG[m.kind].className)}>
                    {TAG[m.kind].text}
                  </span>
                  <span className="text-[17px] font-semibold leading-snug">{m.label}</span>
                  {m.music && (
                    <span className="rounded border border-rule bg-paper px-1.5 text-[13px] tabular-nums text-muted">
                      ♪ {musicTag(m.music)}
                    </span>
                  )}
                </span>
                {(m.detail || multiVideo?.[m.recordingId]) && (
                  <span className="block text-sm text-muted">
                    {[m.detail, multiVideo?.[m.recordingId]].filter(Boolean).join(" · ")}
                  </span>
                )}
                {summary.map((s, k) => (
                  <span key={k} className="mt-1 block text-[16px] leading-snug">
                    {s}
                  </span>
                ))}
              </span>
            </button>
            {m.pages && m.pages.length > 1 && (
              <div className="-mt-1 flex flex-wrap gap-1 px-4 pb-3 pl-[5.5rem]">
                {m.pages.map((p, pi) => (
                  <button
                    key={`${p.page}-${p.seconds}`}
                    type="button"
                    onClick={() =>
                      now?.play({
                        recordingId: m.recordingId,
                        seconds: p.seconds,
                        label: `${m.label}, page ${p.page}`,
                        endSeconds: m.pages![pi + 1]?.seconds ?? m.endSeconds,
                        summary: m.summary,
                        music: m.music ? { ...m.music, page: p.page, box: null } : null,
                      })
                    }
                    className="min-h-8 rounded-lg border border-rule bg-paper px-2 text-xs font-semibold text-accent-ink"
                  >
                    p.{p.page} <span className="font-normal text-muted">{formatClock(p.seconds)}</span>
                  </button>
                ))}
              </div>
            )}
            {on && score && now?.jump?.music && (
              <div className="mx-3 mb-3 flex h-[45vh] flex-col overflow-hidden rounded-xl lg:hidden">
                <MusicPanel
                  key={`${now.jump.music.page}-${now.jump.seconds}`}
                  music={now.jump.music}
                  score={score}
                  studentId={studentId}
                />
              </div>
            )}
            {said.length > 0 && (
              <details className="group border-t border-rule/70 px-4 py-2">
                <summary className="flex min-h-9 cursor-pointer list-none items-center gap-2 text-sm font-medium text-muted [&::-webkit-details-marker]:hidden">
                  <span aria-hidden className="transition-transform group-open:rotate-90">
                    ›
                  </span>
                  What was said ({said.length} line{said.length === 1 ? "" : "s"})
                </summary>
                <ul className="mt-1 flex max-h-72 flex-col gap-1 overflow-y-auto text-[15px] leading-snug">
                  {said.map((l, k) => (
                    <li key={k}>
                      <button
                        type="button"
                        onClick={() => now?.play({ recordingId: m.recordingId, seconds: l.seconds, label: m.label, endSeconds: null })}
                        className="mr-1.5 text-xs font-semibold tabular-nums text-accent-ink"
                      >
                        {formatClock(l.seconds)}
                      </button>
                      {l.text}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </li>
        );
      })}
    </ol>
  );
}
