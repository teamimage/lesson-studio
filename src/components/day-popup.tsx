"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useRef, useState } from "react";
import { addHrefFor } from "@/components/press-to-add";

// A day on a calendar: tapping it pops up that day's lessons (a sheet from
// the bottom on a phone, a box in the middle on wider screens).
export function DayPopup({
  label,
  className,
  current,
  children,
  title,
  body,
  addDate,
}: {
  label: string;
  className?: string;
  current?: boolean;
  children: ReactNode;
  title: ReactNode;
  body: ReactNode;
  /** Press and hold (or right-click) the day to add a lesson on it. */
  addDate?: string;
}) {
  const router = useRouter();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);
  function add() {
    if (!addDate) return;
    fired.current = true;
    if (navigator.vibrate) navigator.vibrate(15);
    router.push(addHrefFor(addDate));
  }
  function clear() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  function close() {
    dialog.current?.close();
    setOpen(false);
  }
  return (
    <>
      <button
        type="button"
        aria-label={label}
        aria-current={current ? "date" : undefined}
        className={className}
        style={{ WebkitTouchCallout: "none" }}
        onPointerDown={(e) => {
          fired.current = false;
          if (!addDate || e.pointerType === "mouse") return;
          start.current = { x: e.clientX, y: e.clientY };
          clear();
          timer.current = setTimeout(add, 500);
        }}
        onPointerMove={(e) => {
          if (start.current && Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 10) clear();
        }}
        onPointerUp={clear}
        onPointerCancel={clear}
        onContextMenu={(e) => {
          if (!addDate) return;
          e.preventDefault();
          clear();
          if (!fired.current) add();
        }}
        onClick={() => {
          if (fired.current) return;
          setOpen(true);
          requestAnimationFrame(() => dialog.current?.showModal());
        }}
      >
        {children}
      </button>
      {open && (
        <dialog
          ref={dialog}
          onClose={() => setOpen(false)}
          onClick={(e) => {
            if (e.target === dialog.current) close();
          }}
          className="m-0 mt-auto max-h-[85vh] w-full max-w-none overflow-y-auto rounded-t-2xl bg-paper p-0 text-ink backdrop:bg-black/40 sm:m-auto sm:max-w-md sm:rounded-2xl"
        >
          <div className="flex flex-col gap-2 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-[19px] font-semibold">{title}</h3>
              <button type="button" onClick={close} aria-label="Close" className="grid size-10 place-items-center rounded-full text-2xl text-muted hover:bg-rule/40">
                ×
              </button>
            </div>
            {body}
          </div>
        </dialog>
      )}
    </>
  );
}
