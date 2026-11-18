"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useRef } from "react";

const HOLD_MS = 500;

/** Add lesson for a date (and time), coming back to this page afterwards. */
export function addHrefFor(date: string, time?: string | null): string {
  const q = new URLSearchParams({ date });
  if (time) q.set("time", time);
  q.set("next", window.location.pathname + window.location.search);
  return `/schedule/new?${q.toString()}`;
}

/**
 * Skip presses that start on a lesson, on something you can tap, or inside a
 * pop-up opened from within this day (a lesson's Edit / Delete menu).
 */
function onSomething(target: EventTarget | null, box: HTMLElement | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target.closest("[data-lesson], a, button, input, select, textarea, form")) return true;
  const dialog = target.closest("dialog");
  return !!dialog && !!box && box.contains(dialog);
}

/**
 * Press and hold (touch) or double-click / right-click (mouse) on an empty
 * spot of a calendar day to add a lesson there. With `hours`, the spot's
 * height picks the time (the week time grid), to the nearest 15 minutes.
 */
export function PressToAdd({
  date,
  hours,
  id,
  className,
  style,
  children,
}: {
  date: string;
  /** Time grid only: the first hour shown and pixels per hour. */
  hours?: { first: number; px: number };
  id?: string;
  className?: string;
  style?: React.CSSProperties;
  children?: ReactNode;
}) {
  const router = useRouter();
  const box = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);

  function timeAt(clientY: number): string | null {
    if (!hours || !box.current) return null;
    const y = clientY - box.current.getBoundingClientRect().top;
    const mins = Math.max(0, Math.min(23 * 60 + 45, Math.round(((hours.first * 60 + (y / hours.px) * 60) / 15)) * 15));
    return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
  }
  function add(clientY: number) {
    fired.current = true;
    if (navigator.vibrate) navigator.vibrate(15);
    router.push(addHrefFor(date, timeAt(clientY)));
  }
  function clear() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }

  return (
    <div
      ref={box}
      id={id}
      className={className}
      style={{ WebkitTouchCallout: "none", WebkitUserSelect: "none", userSelect: "none", ...style }}
      onPointerDown={(e) => {
        fired.current = false;
        if (e.pointerType === "mouse" || onSomething(e.target, box.current)) return;
        start.current = { x: e.clientX, y: e.clientY };
        const y = e.clientY;
        clear();
        timer.current = setTimeout(() => add(y), HOLD_MS);
      }}
      onPointerMove={(e) => {
        if (start.current && Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 10) clear();
      }}
      onPointerUp={clear}
      onPointerCancel={clear}
      onDoubleClick={(e) => {
        if (!onSomething(e.target, box.current)) add(e.clientY);
      }}
      onContextMenu={(e) => {
        if (onSomething(e.target, box.current)) return;
        e.preventDefault();
        clear();
        if (!fired.current) add(e.clientY);
      }}
      onClickCapture={(e) => {
        if (fired.current) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
    >
      {children}
    </div>
  );
}
