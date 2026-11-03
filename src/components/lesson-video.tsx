"use client";

import { useEffect, useRef, type Ref, type VideoHTMLAttributes } from "react";
import { CONTAINED_VIDEO_PROPS, useContainedVideo } from "@/lib/use-contained-video";

type Props = Omit<VideoHTMLAttributes<HTMLVideoElement>, "src" | "ref"> & {
  recordingId: string;
  /**
   * Signed link to the original file. Plays when there's no streaming copy.
   * Null on family screens once the streaming copy is ready.
   */
  src: string | null;
  /** True when a streaming copy is ready; its address is fetched on mount. */
  streamReady: boolean;
  ref?: Ref<HTMLVideoElement>;
  /** Angles of one multi-angle player share a group and may play together. */
  group?: string;
};

/**
 * A lesson video player. Plays the fast streaming copy (HLS) when there is
 * one: natively on iPhone, iPad and Safari, through hls.js elsewhere. Falls
 * back to the original file if the stream can't be loaded. It's an ordinary
 * <video> either way, so seeking (music stand timeline) works the same.
 */
export function LessonVideo({ recordingId, src, streamReady, ref, group, ...rest }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  useContainedVideo(videoRef, group);

  const setRef = (el: HTMLVideoElement | null) => {
    videoRef.current = el;
    if (typeof ref === "function") ref(el);
    else if (ref) ref.current = el;
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    // #t=0.1 makes iPhone Safari show the first frame instead of a black box.
    const original = src ? `${src}#t=0.1` : null;
    if (!streamReady) {
      if (original) video.src = original;
      return;
    }

    let cancelled = false;
    let destroy: (() => void) | null = null;
    const fallback = () => {
      if (cancelled) return;
      destroy?.();
      destroy = null;
      if (original && video.src !== original) video.src = original;
    };

    (async () => {
      try {
        const res = await fetch(`/api/recordings/${recordingId}/stream`, { cache: "no-store" });
        const { url } = (await res.json()) as { url: string | null };
        if (cancelled) return;
        if (!url) return fallback();

        if (video.canPlayType("application/vnd.apple.mpegurl")) {
          video.addEventListener("error", fallback, { once: true });
          video.src = url;
          return;
        }
        const { default: Hls } = await import("hls.js");
        if (cancelled) return;
        if (!Hls.isSupported()) return fallback();
        const hls = new Hls({ startLevel: -1, capLevelToPlayerSize: true });
        destroy = () => hls.destroy();
        hls.on(Hls.Events.ERROR, (_e, data) => {
          if (data.fatal) fallback();
        });
        hls.loadSource(url);
        hls.attachMedia(video);
      } catch {
        fallback();
      }
    })();

    return () => {
      cancelled = true;
      video.removeEventListener("error", fallback);
      destroy?.();
    };
  }, [recordingId, src, streamReady]);

  return <video ref={setRef} data-angle-group={group} {...rest} {...CONTAINED_VIDEO_PROPS} />;
}
