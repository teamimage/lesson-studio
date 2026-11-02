"use client";

import Link from "next/link";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Button } from "./ui";

type Panel = "brief" | "sheet";

// The Desk card's action row. Pre-lesson brief and Printable sheet open a
// tall panel right below the row, inside the same card, instead of going to
// another page. Clicking the button again (or Close) folds it away.
export function DeskPanels({
  studentId,
  studentName,
  sheetLessonId,
  recordButton,
  musicStandButton,
  brief,
  sheet,
}: {
  studentId: string;
  studentName: string;
  /** The approved lesson the sheet is for, or null when there is none yet. */
  sheetLessonId: string | null;
  recordButton: ReactNode;
  musicStandButton: ReactNode;
  brief: ReactNode;
  sheet: ReactNode | null;
}) {
  const [open, setOpen] = useState<Panel | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  // Bring the panel's top into view when it opens, without jumping if it
  // is already on screen.
  useEffect(() => {
    if (open) panelRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [open]);

  const toggle = (p: Panel) => setOpen((cur) => (cur === p ? null : p));

  const toggleClass = (p: Panel) =>
    open === p ? "w-full text-sm border-accent! bg-accent-soft! text-accent-ink" : "w-full text-sm";

  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {recordButton}
        <Button
          type="button"
          variant="secondary"
          className={toggleClass("brief")}
          aria-expanded={open === "brief"}
          aria-controls="desk-panel"
          onClick={() => toggle("brief")}
        >
          Pre-lesson brief
        </Button>
        {sheet ? (
          <Button
            type="button"
            variant="secondary"
            className={toggleClass("sheet")}
            aria-expanded={open === "sheet"}
            aria-controls="desk-panel"
            onClick={() => toggle("sheet")}
          >
            Printable sheet
          </Button>
        ) : (
          <span className="inline-flex min-h-11 items-center justify-center rounded-xl border border-dashed border-rule text-sm text-muted">
            No sheet yet
          </span>
        )}
        {musicStandButton}
      </div>

      {open && (
        <div
          id="desk-panel"
          ref={panelRef}
          className="scroll-mt-4 rounded-2xl border border-rule bg-paper"
          role="region"
          aria-label={open === "brief" ? "Pre-lesson brief" : "Printable sheet"}
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule px-4 py-3">
            <div className="font-semibold">
              {open === "brief" ? "Pre-lesson brief" : "Printable sheet"}
              <span className="font-normal text-muted"> · {studentName}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {open === "brief" ? (
                <Link
                  href={`/students/${studentId}/lessons/new`}
                  className="inline-flex min-h-9 items-center rounded-xl bg-accent px-3 text-sm font-semibold text-white hover:bg-accent-ink"
                >
                  Record lesson
                </Link>
              ) : (
                <>
                  <Button type="button" className="min-h-9 px-3 text-sm" onClick={() => printOnly(sheetRef.current)}>
                    Print or save PDF
                  </Button>
                  <Link href={`/family/${studentId}`} className="px-1 text-sm text-accent-ink underline">
                    Parent view
                  </Link>
                  {sheetLessonId && (
                    <Link href={`/lessons/${sheetLessonId}`} className="px-1 text-sm text-accent-ink underline">
                      Open lesson
                    </Link>
                  )}
                </>
              )}
              <Button type="button" variant="ghost" className="min-h-9 px-3 text-sm" onClick={() => setOpen(null)}>
                Close ✕
              </Button>
            </div>
          </div>
          <div className="p-3 sm:p-5">
            {open === "brief" ? (
              brief
            ) : (
              <div ref={sheetRef} className="default-text-sizes overflow-x-auto rounded-xl">
                {sheet}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// Print just one element: copy it into a top-level holder, hide the rest of
// the page for the print, then tidy up.
function printOnly(el: HTMLElement | null) {
  if (!el) return;
  document.getElementById("print-only")?.remove();
  const holder = document.createElement("div");
  holder.id = "print-only";
  holder.className = el.className;
  holder.innerHTML = el.innerHTML;
  document.body.appendChild(holder);
  document.body.dataset.printOnly = "1";
  const done = () => {
    holder.remove();
    delete document.body.dataset.printOnly;
    window.removeEventListener("afterprint", done);
  };
  window.addEventListener("afterprint", done);
  window.print();
  // Some browsers (iOS Safari) return from print() before printing and
  // skip afterprint; fall back to tidying a moment later.
  setTimeout(() => {
    if (document.getElementById("print-only")) done();
  }, 60_000);
}
