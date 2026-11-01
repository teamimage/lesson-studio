"use client";

import { useRef, type VideoHTMLAttributes } from "react";
import { CONTAINED_VIDEO_PROPS, useContainedVideo } from "@/lib/use-contained-video";

/** A plain <video> that pauses when the app is left (see useContainedVideo). */
export function ContainedVideo(props: Omit<VideoHTMLAttributes<HTMLVideoElement>, "ref">) {
  const ref = useRef<HTMLVideoElement | null>(null);
  useContainedVideo(ref);
  return <video ref={ref} {...props} {...CONTAINED_VIDEO_PROPS} />;
}
