"use client";

/**
 * Keeps a phone or tablet screen from auto-locking while something long runs
 * (a lesson video upload). Two layers:
 *  1. The Screen Wake Lock API, asked for from the tap and again every time
 *     the page comes back, because the browser drops it when the page hides.
 *  2. On iPhone and iPad, a tiny video with a silent sound track, playing out
 *     of sight. Home-screen apps on iOS before 18.4 (David's iPad is on 16.7)
 *     accept the wake lock request but ignore it.
 *     iOS only stops the screen sleeping for a video that is (a) started by a
 *     tap, (b) not muted, with a sound track, and (c) not set to loop; looping
 *     and muted videos are treated as decoration and let the screen sleep.
 *     So the video is unmuted (its sound is silence) and jumps back to the
 *     start instead of looping.
 * Call primeKeepAwake() inside a tap handler (e.g. "Choose lesson video");
 * it starts holding the screen right away, which also covers the minutes iOS
 * spends "Preparing" a long video from Photos before the upload starts.
 */

const SILENT_MP4 = "data:video/mp4;base64,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b21hX21lPTEgdHJlbGxpcz0xIDh4OGRjdD0wIGNxbT0wIGRlYWR6b25lPTIxLDExIGZhc3RfcHNraXA9MSBjaHJvbWFfcXBfb2Zmc2V0PS0yIHRocmVhZHM9MSBsb29rYWhlYWRfdGhyZWFkcz0xIHNsaWNlZF90aHJlYWRzPTAgbnI9MCBkZWNpbWF0ZT0xIGludGVybGFjZWQ9MCBibHVyYXlfY29tcGF0PTAgY29uc3RyYWluZWRfaW50cmE9MCBiZnJhbWVzPTAgd2VpZ2h0cD0wIGtleWludD0yNTAga2V5aW50X21pbj0xIHNjZW5lY3V0PTQwIGludHJhX3JlZnJlc2g9MCByY19sb29rYWhlYWQ9NDAgcmM9Y3JmIG1idHJlZT0xIGNyZj0yMy4wIHFjb21wPTAuNjAgcXBtaW49MCBxcG1heD02OSBxcHN0ZXA9NCBpcF9yYXRpbz0xLjQwIGFxPTE6MS4wMACAAAAADmWIhAW///8PRQABT3+AARggBwEYIAcBGCAHARggBwEYIAcBGCAHARggBwEYIAcAAAAGQZo4CvqAARggBwEYIAcBGCAHARggBwEYIAcBGCAHARggBwEYIAc=";
// If a tap primes but no upload follows (picker cancelled), let go after this.
const PRIME_TIMEOUT_MS = 15 * 60 * 1000;

let holders = 0;
let primed = false;
let primeTimer: ReturnType<typeof setTimeout> | null = null;
let lock: WakeLockSentinel | null = null;
let video: HTMLVideoElement | null = null;
let listening = false;

function isApple(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function needsVideo(): boolean {
  return isApple() || !("wakeLock" in navigator);
}

function getVideo(): HTMLVideoElement {
  if (video) return video;
  const v = document.createElement("video");
  v.src = SILENT_MP4;
  v.playsInline = true;
  v.setAttribute("playsinline", "");
  v.setAttribute("title", "Keeping the screen on");
  v.setAttribute("aria-hidden", "true");
  v.style.cssText = "position:fixed;left:0;bottom:0;width:1px;height:1px;opacity:0.01;pointer-events:none;z-index:-1";
  // Jump back near the start instead of looping (see the note above).
  v.addEventListener("timeupdate", () => {
    if (v.currentTime > 1) v.currentTime = Math.random() * 0.5;
  });
  v.addEventListener("ended", () => {
    if (active()) {
      v.currentTime = 0;
      v.play().catch(() => {});
    }
  });
  document.body.appendChild(v);
  video = v;
  return v;
}

function active(): boolean {
  return holders > 0 || primed;
}

async function requestLock() {
  if (lock && !lock.released) return;
  try {
    lock = (await navigator.wakeLock?.request("screen")) ?? null;
  } catch {
    lock = null;
  }
}

function apply() {
  if (!active() || document.visibilityState !== "visible") return;
  void requestLock();
  if (needsVideo()) {
    const v = getVideo();
    if (v.paused) v.play().catch(() => {});
  }
}

function stopAll() {
  lock?.release().catch(() => {});
  lock = null;
  video?.pause();
}

function listen() {
  if (listening) return;
  document.addEventListener("visibilitychange", apply);
  window.addEventListener("pageshow", apply);
  listening = true;
}

/** Call from a tap: starts keeping the screen on straight away. */
export function primeKeepAwake() {
  if (typeof document === "undefined") return;
  primed = true;
  listen();
  if (primeTimer) clearTimeout(primeTimer);
  primeTimer = setTimeout(() => {
    primed = false;
    if (holders <= 0) stopAll();
  }, PRIME_TIMEOUT_MS);
  // Both calls must happen inside the tap for iOS to allow them.
  void requestLock();
  if (needsVideo()) getVideo().play().catch(() => {});
}

/** Holds the screen awake until the returned release() is called. */
export function keepAwake(): () => void {
  if (typeof document === "undefined") return () => {};
  holders++;
  listen();
  apply();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holders = Math.max(0, holders - 1);
    if (holders > 0) return;
    primed = false;
    if (primeTimer) clearTimeout(primeTimer);
    stopAll();
  };
}
