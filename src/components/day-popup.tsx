"use client";

import { type ReactNode, useRef, useState } from "react";

// A day on a calendar: tapping it pops up that day's lessons (a sheet from
// the bottom on a phone, a box in the middle on wider screens).
export function DayPopup({
  label,
  className,
  current,
  children,
  title,
  body,
}: {
  label: string;
  className?: string;
  current?: boolean;
  children: ReactNode;
  title: ReactNode;
  body: ReactNode;
}) {
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
        onClick={() => {
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
