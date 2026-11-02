"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { instrumentLabel } from "@/lib/constants";
import { AvatarFace } from "./avatar";
import { cx } from "./ui";

export type PickerStudent = {
  id: string;
  name: string;
  instrument: string;
  active: boolean;
  photoSrc: string | null;
  drafts: number;
};

// Dropdown button for choosing which student the teacher desk shows.
export function StudentPicker({ students, selectedId }: { students: PickerStudent[]; selectedId: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = students.find((s) => s.id === selectedId);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex min-h-12 w-full items-center gap-3 rounded-2xl border border-rule bg-sheet px-4 text-left shadow-[0_1px_0_rgba(43,37,33,0.04)] hover:border-accent/50 sm:w-80"
      >
        <AvatarFace
          name={selected?.name ?? "Student"}
          instrument={selected?.instrument ?? ""}
          photoSrc={selected?.photoSrc}
          className="h-9 w-9 text-lg"
        />
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-accent-ink">Student</span>
          <span className="block truncate text-[16px] font-semibold leading-tight">{selected?.name ?? "Choose a student"}</span>
        </span>
        <span className={cx("text-muted transition", open && "rotate-180")} aria-hidden>
          ▾
        </span>
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute left-0 z-20 mt-2 w-full overflow-hidden rounded-2xl border border-rule bg-sheet shadow-lg sm:w-80"
        >
          <ul className="max-h-80 overflow-y-auto py-1">
            {students.map((s) => {
              const on = s.id === selectedId;
              return (
                <li key={s.id}>
                  <Link
                    href={`/teacher?student=${s.id}`}
                    scroll={false}
                    role="option"
                    aria-selected={on}
                    onClick={() => setOpen(false)}
                    className={cx(
                      "flex min-h-11 items-center gap-3 px-4 py-2 text-[15px]",
                      on ? "bg-accent-soft font-semibold text-accent-ink" : "hover:bg-accent-soft/60",
                      !s.active && !on && "text-muted",
                    )}
                  >
                    <AvatarFace name={s.name} instrument={s.instrument} photoSrc={s.photoSrc} className="h-8 w-8 text-base" />
                    <span className="min-w-0 flex-1 truncate">
                      {s.name}
                      <span className="ml-2 text-xs font-normal text-muted">{instrumentLabel(s.instrument)}</span>
                    </span>
                    {!s.active && <span className="text-xs text-muted">inactive</span>}
                    {s.drafts > 0 && (
                      <span className="rounded-full bg-amber-soft px-1.5 text-[11px] font-bold text-amber" title="drafts to approve">
                        {s.drafts}
                      </span>
                    )}
                    {on && <span aria-hidden>✓</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
          <Link
            href="/students/new"
            className="flex min-h-11 items-center border-t border-rule px-4 text-sm font-semibold text-accent-ink hover:bg-accent-soft"
          >
            + Add a student
          </Link>
        </div>
      )}
    </div>
  );
}
