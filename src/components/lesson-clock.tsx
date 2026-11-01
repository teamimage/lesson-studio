"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";

const noop = () => () => {};

/** A wall-clock time like "10:02 AM" in the viewer's own time zone. */
export function ClockTime({ iso, className }: { iso: string; className?: string }) {
  const label = useSyncExternalStore(
    noop,
    () => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
    () => "",
  );
  return <span className={className}>{label}</span>;
}

/** Time since the lesson started, ticking every second. */
export function LessonTimer({ startedAt, className }: { startedAt: string; className?: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const t = setInterval(tick, 1000);
    const first = setTimeout(tick, 0);
    return () => {
      clearInterval(t);
      clearTimeout(first);
    };
  }, []);
  const secs = now === null ? 0 : Math.max(0, Math.floor((now - Date.parse(startedAt)) / 1000));
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  const text = h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
  return <span className={className}>{now === null ? "–:––" : text}</span>;
}

/** Re-reads the page from the server every few seconds, so the card shows what the stand is doing. */
export function AutoRefresh({ seconds = 8 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, seconds * 1000);
    return () => clearInterval(t);
  }, [router, seconds]);
  return null;
}
