"use client";

import { type ReactNode, useState } from "react";
import { cx } from "@/components/ui";

export type TimelineKind = "lesson" | "practice" | "video" | "review";
export type TimelineEntry = {
  key: string;
  kind: TimelineKind;
  /** Heading for the day group, e.g. "Tue, Nov 3". */
  day: string;
  node: ReactNode;
};

const FILTERS: { key: "all" | TimelineKind; label: string }[] = [
  { key: "all", label: "Everything" },
  { key: "lesson", label: "Lessons" },
  { key: "practice", label: "Practice" },
  { key: "video", label: "Videos" },
  { key: "review", label: "Reviews" },
];

const DOT: Record<TimelineKind, string> = {
  lesson: "bg-accent",
  practice: "bg-sage",
  video: "bg-ink",
  review: "bg-plum",
};

/**
 * Version 3 student page: one stream of everything, newest first, grouped
 * by day. The filter chips narrow it in place; each entry opens in place.
 */
export function Timeline({ entries, initial = "all" }: { entries: TimelineEntry[]; initial?: string }) {
  const [show, setShow] = useState<"all" | TimelineKind>(
    FILTERS.some((f) => f.key === initial) ? (initial as "all" | TimelineKind) : "all",
  );
  const counts: Record<string, number> = { all: entries.length };
  for (const e of entries) counts[e.kind] = (counts[e.kind] ?? 0) + 1;
  const shown = show === "all" ? entries : entries.filter((e) => e.kind === show);
  const days: { day: string; items: TimelineEntry[] }[] = [];
  for (const e of shown) {
    const last = days[days.length - 1];
    if (last?.day === e.day) last.items.push(e);
    else days.push({ day: e.day, items: [e] });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="sticky top-24 z-[5] -mx-4 flex gap-1.5 overflow-x-auto bg-paper/95 px-4 py-2 backdrop-blur" role="tablist">
        {FILTERS.filter((f) => f.key === "all" || counts[f.key]).map((f) => (
          <button
            key={f.key}
            role="tab"
            aria-selected={show === f.key}
            onClick={() => setShow(f.key)}
            className={cx(
              "flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[15px]",
              show === f.key ? "border-accent bg-accent-soft font-semibold text-accent-ink" : "border-rule bg-sheet text-muted",
            )}
          >
            {f.key !== "all" && <span className={cx("h-2 w-2 rounded-full", DOT[f.key])} aria-hidden />}
            {f.label}
            <span className="tabular-nums opacity-70">{counts[f.key] ?? 0}</span>
          </button>
        ))}
      </div>
      {days.length === 0 && <p className="text-[16px] text-muted">Nothing here yet.</p>}
      <ol className="flex flex-col gap-5">
        {days.map((d) => (
          <li key={d.day} className="relative border-l-2 border-rule pl-4">
            <div className="-ml-[1.4rem] mb-2 flex items-center gap-2">
              <span className="h-3 w-3 rounded-full border-2 border-paper bg-rule" aria-hidden />
              <span className="text-[13px] font-semibold uppercase tracking-[0.1em] text-muted">{d.day}</span>
            </div>
            <div className="flex flex-col gap-2">
              {d.items.map((e) => (
                <div key={e.key} className="relative">
                  <span className={cx("absolute top-5 -left-[1.38rem] h-2.5 w-2.5 rounded-full", DOT[e.kind])} aria-hidden />
                  {e.node}
                </div>
              ))}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** One timeline entry: a title row that opens its detail in place. */
export function Entry({
  title,
  meta,
  badge,
  open,
  tone = "sheet",
  children,
}: {
  title: ReactNode;
  meta?: ReactNode;
  badge?: ReactNode;
  open?: boolean;
  tone?: "sheet" | "amber" | "plum";
  children: ReactNode;
}) {
  return (
    <details
      open={open}
      className={cx(
        "group rounded-2xl border",
        tone === "amber" ? "border-amber/25 bg-amber-soft" : tone === "plum" ? "border-plum/20 bg-plum-soft" : "border-rule bg-sheet",
      )}
    >
      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-2.5 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1">
          <span className="block text-[17px] font-semibold leading-snug">{title}</span>
          {meta && <span className="block truncate text-sm text-muted group-open:whitespace-normal">{meta}</span>}
        </span>
        {badge}
        <span aria-hidden className="text-xl text-muted transition-transform group-open:rotate-90">
          ›
        </span>
      </summary>
      <div className="flex flex-col gap-3 border-t border-rule/70 px-4 pb-4 pt-3 text-[16px]">{children}</div>
    </details>
  );
}
