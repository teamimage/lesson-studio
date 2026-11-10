"use client";

import Link from "next/link";
import { type ReactNode, useEffect, useRef, useState } from "react";

/**
 * Version 3 student page: the big Start lesson button with a round ▾ on its
 * right that drops down the other ways to make a lesson (Write up by hand).
 * `children` is the main button (a form or a link), full width.
 */
export function StartLessonMenu({
  children,
  items,
}: {
  children: ReactNode;
  items: { href: string; label: string; hint?: string }[];
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  return (
    <div ref={box} className="relative">
      <div className="[&_a]:pr-16 [&_button]:pr-16">{children}</div>
      <button
        type="button"
        aria-label="More ways to add a lesson"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="absolute top-1/2 right-2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/30 text-white shadow-sm ring-2 ring-white/80 hover:bg-black/40"
      >
        <span aria-hidden className={`text-[15px] leading-none transition-transform ${open ? "rotate-180" : ""}`}>
          ▼
        </span>
      </button>
      {open && (
        <div role="menu" className="absolute top-full right-0 z-20 mt-1.5 w-full min-w-56 overflow-hidden rounded-xl border border-rule bg-sheet shadow-lg sm:w-72">
          {items.map((i) => (
            <Link
              key={i.href}
              role="menuitem"
              href={i.href}
              className="flex flex-col px-4 py-3 text-[16px] font-medium hover:bg-accent-soft"
              onClick={() => setOpen(false)}
            >
              {i.label}
              {i.hint && <span className="text-sm font-normal text-muted">{i.hint}</span>}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
