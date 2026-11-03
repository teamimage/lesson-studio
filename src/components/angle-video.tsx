"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
  type SyntheticEvent,
} from "react";
import { LessonVideo } from "@/components/lesson-video";
import { cx } from "@/components/ui";

/** One camera angle of a lesson. */
export type Angle = {
  id: string;
  url: string | null;
  streamReady: boolean;
  name: string;
  /** When the video's first frame happened (file clock or lined up by hand). */
  startedAt: string | null;
  /** The main camera: its sound plays whichever angle is on screen. */
  isMain: boolean;
};

/**
 * Seconds to add to a time in `from` to get the same moment in `to`, or null
 * when either video isn't lined up with the clock.
 */
export function angleShift(
  from: Pick<Angle, "startedAt">,
  to: Pick<Angle, "startedAt">,
): number | null {
  if (!from.startedAt || !to.startedAt) return null;
  const a = Date.parse(from.startedAt);
  const b = Date.parse(to.startedAt);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return (a - b) / 1000;
}

/**
 * The angle to open on: the main camera when it lines up with `fromId` (and,
 * given a time in `fromId`, had started recording by then).
 */
export function openingAngle(angles: Angle[], fromId: string, seconds = 0): string {
  const from = angles.find((a) => a.id === fromId);
  const main = angles.find((a) => a.isMain);
  const shift = from && main ? angleShift(from, main) : null;
  if (main && shift !== null && seconds + shift >= 0) return main.id;
  return fromId;
}

type Handler = (e: SyntheticEvent<HTMLVideoElement>) => void;

/**
 * A lesson video that can be watched from any of its camera angles. Switching
 * angle keeps the place in the lesson (the angles are lined up by their start
 * times, from the file clock or the sync beep). The main camera's sound keeps
 * playing under the other angles: its video stays loaded, hidden, and follows
 * the angle on screen. Where the main camera didn't record (it started later
 * or stopped earlier), the angle's own sound plays instead.
 *
 * `videoRef` always points at the video on screen.
 */
export function AngleVideo({
  angles,
  current,
  onSwitch,
  videoRef,
  className,
  autoPlay,
  preload = "metadata",
  tone = "light",
  onTimeUpdate,
  onLoadedMetadata,
  onSeeked,
  children,
}: {
  angles: Angle[];
  current: string;
  onSwitch: (id: string) => void;
  videoRef?: RefObject<HTMLVideoElement | null>;
  className?: string;
  autoPlay?: boolean;
  preload?: "auto" | "metadata" | "none";
  tone?: "light" | "dark";
  onTimeUpdate?: Handler;
  onLoadedMetadata?: Handler;
  onSeeked?: Handler;
  /** Overlays drawn on top of the video (e.g. Replay clip buttons). */
  children?: ReactNode;
}) {
  const group = useId();
  const cur = angles.find((a) => a.id === current) ?? angles[0];
  const main = angles.find((a) => a.isMain) ?? null;
  const onMain = !!main && cur?.id === main.id;
  const mainRef = useRef<HTMLVideoElement | null>(null);
  const otherRef = useRef<HTMLVideoElement | null>(null);
  // The angle on screen, updated the moment a switch is pressed, so events
  // from a video that is going away are ignored.
  const curId = useRef(cur?.id);
  const pending = useRef<{ t: number; play: boolean } | null>(null);
  // Only the first video shown starts by itself; later angles take over
  // playing or paused, as the one before was.
  const [firstId] = useState(cur?.id);

  useLayoutEffect(() => {
    curId.current = cur?.id;
    if (videoRef) videoRef.current = onMain ? mainRef.current : otherRef.current;
  });

  const shiftToMain = cur && main && !onMain ? angleShift(cur, main) : null;

  // The main camera's sound under another angle.
  const curKey = cur?.id;
  const mainKey = main?.id;
  useEffect(() => {
    const m = mainRef.current;
    const v = otherRef.current;
    if (!curKey || !mainKey || onMain || !m || !v) return;
    if (shiftToMain === null) {
      m.pause();
      v.muted = false;
      return;
    }
    const shift = shiftToMain;
    const id = curKey;
    const live = () => curId.current === id;
    let blocked = false;
    let lastSeek = 0;
    v.muted = true;

    const align = (strict: boolean) => {
      if (!live()) return;
      const t = v.currentTime + shift;
      const dur = m.duration;
      const covered = t >= 0 && (!Number.isFinite(dur) || t < dur - 0.25);
      if (!covered || blocked) {
        if (!m.paused) m.pause();
        v.muted = false;
        return;
      }
      v.muted = true;
      const now = Date.now();
      const drift = Math.abs(m.currentTime - t);
      if ((strict && drift > 0.2) || (drift > 0.4 && now - lastSeek > 2000)) {
        m.currentTime = t;
        lastSeek = now;
      }
      if (m.playbackRate !== v.playbackRate) m.playbackRate = v.playbackRate;
      if (v.paused) {
        if (!m.paused) m.pause();
      } else if (m.paused) {
        void m.play().catch(() => {
          // The browser wouldn't start the sound by itself: use this angle's own.
          blocked = true;
          if (live()) v.muted = false;
        });
      }
    };
    const onPlay = () => {
      blocked = false;
      align(true);
    };
    const onPause = () => {
      if (live() && !m.paused) m.pause();
    };
    const onSeek = () => align(true);
    const onTick = () => align(false);
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    v.addEventListener("seeked", onSeek);
    v.addEventListener("timeupdate", onTick);
    v.addEventListener("ratechange", onTick);
    return () => {
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("seeked", onSeek);
      v.removeEventListener("timeupdate", onTick);
      v.removeEventListener("ratechange", onTick);
    };
  }, [curKey, mainKey, onMain, shiftToMain]);

  if (!cur) return null;

  function switchTo(id: string) {
    const target = angles.find((a) => a.id === id);
    if (!target || target.id === cur.id) return;
    const v = onMain ? mainRef.current : otherRef.current;
    const t = Math.max(0, (v?.currentTime ?? 0) + (angleShift(cur, target) ?? 0));
    const play = !!v && !v.paused;
    curId.current = target.id;
    if (main && target.id === main.id) {
      // The main camera is already loaded (and playing, if its sound was on).
      const m = mainRef.current;
      if (m) {
        m.muted = false;
        if (Math.abs(m.currentTime - t) > 0.3) m.currentTime = t;
        if (play && m.paused) void m.play().catch(() => {});
        if (!play && !m.paused) m.pause();
      }
    } else {
      pending.current = { t, play };
    }
    onSwitch(target.id);
  }

  const visibleOnly =
    (fn?: Handler, id?: string) => (e: SyntheticEvent<HTMLVideoElement>) => {
      if (curId.current === id) fn?.(e);
    };

  const takePending: Handler = (e) => {
    const v = e.currentTarget;
    const p = pending.current;
    if (p && curId.current === cur.id) {
      pending.current = null;
      v.currentTime = p.t;
      if (p.play)
        void v.play().catch(() => {
          if (!onMain) mainRef.current?.pause();
        });
    }
    onLoadedMetadata?.(e);
  };

  const dark = tone === "dark";
  const following = !onMain && shiftToMain !== null;

  return (
    <>
      <div className="relative">
        {main && (
          <LessonVideo
            key={main.id}
            ref={(el) => {
              mainRef.current = el;
            }}
            group={group}
            recordingId={main.id}
            src={main.url}
            streamReady={main.streamReady}
            controls={onMain}
            autoPlay={autoPlay && firstId === main.id}
            playsInline
            preload={onMain || following ? preload : "metadata"}
            aria-hidden={!onMain}
            tabIndex={onMain ? undefined : -1}
            className={
              onMain
                ? className
                : "pointer-events-none absolute top-0 left-0 h-px w-px opacity-0"
            }
            onTimeUpdate={visibleOnly(onTimeUpdate, main.id)}
            onLoadedMetadata={visibleOnly(onLoadedMetadata, main.id)}
            onSeeked={visibleOnly(onSeeked, main.id)}
          />
        )}
        {!onMain && (
          <LessonVideo
            key={cur.id}
            ref={(el) => {
              otherRef.current = el;
            }}
            group={group}
            recordingId={cur.id}
            src={cur.url}
            streamReady={cur.streamReady}
            controls
            muted={following}
            autoPlay={autoPlay && firstId === cur.id}
            playsInline
            preload={preload}
            className={className}
            onTimeUpdate={visibleOnly(onTimeUpdate, cur.id)}
            onLoadedMetadata={takePending}
            onSeeked={visibleOnly(onSeeked, cur.id)}
          />
        )}
        {children}
      </div>
      {angles.length > 1 && (
        <div
          className={cx(
            "flex flex-wrap items-center gap-1.5 px-3 py-2 text-sm",
            dark ? "text-white/70" : "text-muted",
          )}
        >
          <span className="mr-0.5">Camera</span>
          {angles.map((a) => {
            const on = a.id === cur.id;
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => switchTo(a.id)}
                aria-pressed={on}
                className={cx(
                  "min-h-9 rounded-full border px-3 text-sm",
                  dark
                    ? on
                      ? "border-white bg-white font-semibold text-black"
                      : "border-white/30 text-white"
                    : on
                      ? "border-accent bg-accent-soft font-semibold text-accent-ink"
                      : "border-rule bg-paper text-ink",
                )}
              >
                {a.name}
                {a.isMain && <span className={cx("font-normal", on && !dark ? "text-accent-ink" : "opacity-70")}> · main</span>}
              </button>
            );
          })}
          {main && !onMain && (
            <span className="w-full text-xs">
              {following
                ? `Sound from the main camera (${main.name}).`
                : "This angle isn't lined up with the main camera yet, so it plays its own sound. Line it up under Music & video."}
            </span>
          )}
        </div>
      )}
    </>
  );
}

/** A lesson's videos as one player, opening on the main camera. */
export function AnglePlayer({ angles, className }: { angles: Angle[]; className?: string }) {
  const [current, setCurrent] = useState(() => (angles.find((a) => a.isMain) ?? angles[0])?.id ?? "");
  if (angles.length === 0) return null;
  return <AngleVideo angles={angles} current={current} onSwitch={setCurrent} className={className} />;
}
