"use client";

import Link from "next/link";
import { type ReactNode, useRef, useState } from "react";
import { changeLesson, stopSlot, undoChange } from "@/app/downbeat/actions";
import { cx } from "@/components/ui";

export type PressLesson = {
  /** The lesson's own page (/schedule/…), or null for a lesson with no saved lesson time. */
  editHref: string | null;
  title: string;
  when: string;
  studentId: string;
  slotId: string | null;
  /** The slot's own date, what a cancel or stop is keyed on. */
  slotDate: string | null;
  changeId: string | null;
  kind: "regular" | "moved" | "extra" | "cancelled" | "noshow";
};

const HOLD_MS = 500;

// A long press (touch) or right-click (mouse) on a lesson anywhere in the
// schedule opens Edit and Delete. A normal tap still does what it did.
// Delete keeps history: one week's lesson is marked cancelled (Undo on its
// page brings it back), "from this date on" ends the lesson time the day
// before, and a one-off is removed.
export function LessonPress({ lesson, children, className }: { lesson: PressLesson; children: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  const [sure, setSure] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);
  const dialog = useRef<HTMLDialogElement>(null);

  function show() {
    fired.current = true;
    setSure(false);
    setOpen(true);
    requestAnimationFrame(() => dialog.current?.showModal());
  }
  function close() {
    dialog.current?.close();
    setOpen(false);
  }
  function clear() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }

  const off = lesson.kind === "cancelled" || lesson.kind === "noshow";
  const here = typeof window === "undefined" ? "" : window.location.pathname + window.location.search;

  return (
    <>
      <div
        className={cx("select-none [-webkit-touch-callout:none]", className)}
        onPointerDown={(e) => {
          fired.current = false;
          if (e.pointerType === "mouse") return;
          start.current = { x: e.clientX, y: e.clientY };
          clear();
          timer.current = setTimeout(show, HOLD_MS);
        }}
        onPointerMove={(e) => {
          if (start.current && Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 10) clear();
        }}
        onPointerUp={clear}
        onPointerCancel={clear}
        onContextMenu={(e) => {
          e.preventDefault();
          clear();
          show();
        }}
        onClickCapture={(e) => {
          if (fired.current) {
            e.preventDefault();
            e.stopPropagation();
            fired.current = false;
          }
        }}
      >
        {children}
      </div>
      {open && (
        <dialog
          ref={dialog}
          onClose={() => setOpen(false)}
          onClick={(e) => {
            if (e.target === dialog.current) close();
          }}
          className="m-0 mt-auto w-full max-w-none rounded-t-2xl bg-paper p-0 text-ink backdrop:bg-black/40 sm:m-auto sm:max-w-sm sm:rounded-2xl"
        >
          <div className="flex flex-col gap-1 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <div className="text-[18px] font-semibold">{lesson.title}</div>
            <div className="mb-2 text-[15px] text-muted">{lesson.when}</div>
            {lesson.editHref && (
              <Link href={lesson.editHref} className="flex min-h-12 items-center rounded-xl px-3 text-[17px] font-semibold text-accent-ink no-underline hover:bg-accent-soft">
                Edit
              </Link>
            )}
            {off && lesson.changeId ? (
              <form action={undoChange}>
                <input type="hidden" name="change_id" value={lesson.changeId} />
                <input type="hidden" name="next" value={here} />
                <MenuButton>Bring this lesson back</MenuButton>
              </form>
            ) : lesson.kind === "extra" && lesson.changeId ? (
              <form action={undoChange}>
                <input type="hidden" name="change_id" value={lesson.changeId} />
                <input type="hidden" name="next" value={here} />
                <MenuButton danger>Delete this lesson</MenuButton>
              </form>
            ) : lesson.slotId && lesson.slotDate ? (
              <>
                <form action={changeLesson}>
                  <input type="hidden" name="student_id" value={lesson.studentId} />
                  <input type="hidden" name="slot_id" value={lesson.slotId} />
                  <input type="hidden" name="on_date" value={lesson.slotDate} />
                  <input type="hidden" name="kind" value="cancel" />
                  <input type="hidden" name="note" value="Deleted" />
                  <input type="hidden" name="next" value={here} />
                  <MenuButton danger>Delete this week&apos;s lesson</MenuButton>
                </form>
                {sure ? (
                  <form action={stopSlot} className="flex flex-col gap-1 rounded-xl bg-danger-soft/50 p-3">
                    <input type="hidden" name="slot_id" value={lesson.slotId} />
                    <input type="hidden" name="from" value={lesson.slotDate} />
                    <input type="hidden" name="next" value={here} />
                    <p className="text-[15px]">Every lesson at this time from this date on goes. Earlier lessons stay.</p>
                    <MenuButton danger>Yes, delete from this date on</MenuButton>
                  </form>
                ) : (
                  <button
                    type="button"
                    onClick={() => setSure(true)}
                    className="flex min-h-12 w-full items-center rounded-xl px-3 text-left text-[17px] font-medium text-danger hover:bg-danger-soft"
                  >
                    Delete every week from this date on…
                  </button>
                )}
              </>
            ) : (
              <p className="px-3 text-[15px] text-muted">This lesson comes from the student&apos;s Lesson day field. Set it up in Settings → Lesson times to change it here.</p>
            )}
            <button type="button" onClick={close} className="mt-1 flex min-h-12 items-center justify-center rounded-xl text-[17px] font-medium text-muted hover:bg-rule/40">
              Close
            </button>
          </div>
        </dialog>
      )}
    </>
  );
}

function MenuButton({ children, danger }: { children: ReactNode; danger?: boolean }) {
  return (
    <button
      type="submit"
      className={cx(
        "flex min-h-12 w-full items-center rounded-xl px-3 text-left text-[17px] font-medium",
        danger ? "text-danger hover:bg-danger-soft" : "text-accent-ink hover:bg-accent-soft",
      )}
    >
      {children}
    </button>
  );
}
