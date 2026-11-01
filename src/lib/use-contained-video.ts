"use client";

import { useEffect, type RefObject } from "react";

/**
 * Attributes that keep a lesson video inside the app: no picture-in-picture
 * window and no casting. Spread onto every <video>.
 */
export const CONTAINED_VIDEO_PROPS = {
  disablePictureInPicture: true,
  disableRemotePlayback: true,
  controlsList: "noremoteplayback",
} as const;

/**
 * Keeps a lesson video contained in the app instead of acting like a system
 * media player (Android otherwise lets it play on from the home screen):
 * - pauses when the page is hidden (home screen, app switch, screen off,
 *   another tab), when the page is left, and when the player goes away
 *   (navigating to another page, closing the popup);
 * - only one lesson video plays at a time;
 * - the phone's lock-screen / notification controls can't start it again
 *   while the app is in the background.
 */
export function useContainedVideo(ref: RefObject<HTMLVideoElement | null>) {
  useEffect(() => {
    const video = ref.current;
    if (!video) return;

    const pause = () => {
      if (!video.paused) video.pause();
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") pause();
    };
    const onPlay = () => {
      if (document.visibilityState === "hidden") return pause();
      document.querySelectorAll("video").forEach((other) => {
        if (other !== video && !other.paused) other.pause();
      });
      claimMediaSession(video);
    };
    // Picture-in-picture can still be forced on some browsers: close it.
    const onEnterPip = () => {
      if (document.pictureInPictureElement === video) void document.exitPictureInPicture().catch(() => {});
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", pause);
    window.addEventListener("blur", onBlurPauseIfHidden);
    video.addEventListener("play", onPlay);
    video.addEventListener("enterpictureinpicture", onEnterPip);

    function onBlurPauseIfHidden() {
      // Some Android browsers fire blur before visibilitychange; recheck shortly.
      setTimeout(onVisibility, 300);
    }

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", pause);
      window.removeEventListener("blur", onBlurPauseIfHidden);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("enterpictureinpicture", onEnterPip);
      pause();
      releaseMediaSession(video);
    };
  }, [ref]);
}

let sessionOwner: HTMLVideoElement | null = null;

/**
 * Android shows a media notification for any playing video. We can't hide it,
 * but we can make its buttons do nothing useful in the background: play only
 * works while the app is on screen, and no track info or seek controls show.
 */
function claimMediaSession(video: HTMLVideoElement) {
  if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
  const ms = navigator.mediaSession;
  sessionOwner = video;
  try {
    ms.metadata = null;
    ms.setActionHandler("play", () => {
      if (document.visibilityState === "visible") void video.play().catch(() => {});
    });
    ms.setActionHandler("pause", () => video.pause());
    for (const action of ["seekbackward", "seekforward", "seekto", "previoustrack", "nexttrack"] as const) {
      try {
        ms.setActionHandler(action, null);
      } catch {
        // Action not supported by this browser.
      }
    }
  } catch {
    // Media Session not usable here.
  }
}

function releaseMediaSession(video: HTMLVideoElement) {
  if (sessionOwner !== video || typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
  sessionOwner = null;
  try {
    navigator.mediaSession.setActionHandler("play", null);
    navigator.mediaSession.setActionHandler("pause", null);
    navigator.mediaSession.metadata = null;
    navigator.mediaSession.playbackState = "none";
  } catch {
    // ignore
  }
}
