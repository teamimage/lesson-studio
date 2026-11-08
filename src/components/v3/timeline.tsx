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

/** A section that is not part of the timeline, e.g. the music library. */
export type ExtraSection = { key: string; label: string; meta?: string; node: ReactNode };

/**
 * Version 3 student page: one stream of everything, newest first, grouped
 * by day. On a computer the sections are a column of buttons on the left and
 * the chosen one fills a box across the rest of the page; on a phone the
 * buttons run across the top and the box is full width. Extra sections (music,
 * family) sit under the timeline buttons. Each timeline entry opens in place.
 */
export function Timeline({
  entries,
  initial = "all",
  extras = [],
  footer,
}: {
  entries: TimelineEntry[];
  initial?: string;
  extras?: ExtraSection[];
  /** Shown under the timeline sections only (e.g. "Add a lesson"). */
  footer?: ReactNode;
}) {
  const keys = [...FILTERS.map((f) => f.key as string), ...extras.map((x) => x.key)];
  const [show, setShow] = useState<string>(keys.includes(initial) ? initial : "all");
  const counts: Record<string, number> = { all: entries.length };
  for (const e of entries) counts[e.kind] = (counts[e.kind] ?? 0) + 1;
  const extra = extras.find((x) => x.key === show);
  const shown = show === "all" ? entries : entries.filter((e) => e.kind === show);
  const days: { day: string; items: TimelineEntry[] }[] = [];
  for (const e of shown) {
    const last = days[days.length - 1];
    if (last?.day === e.day) last.items.push(e);
    else days.push({ day: e.day, items: [e] });
  }
  const label = extra?.label ?? FILTERS.find((f) => f.key === show)?.label;

  const button = (key: string, text: string, dot?: string, count?: ReactNode) => (
    <button
      key={key}
      role="tab"
      aria-selected={show === key}
      aria-controls="student-section"
      onClick={() => setShow(key)}
      className={cx(
        "flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-3.5 text-left text-[15px] lg:w-full lg:rounded-xl lg:px-3",
        show === key ? "border-accent bg-accent-soft font-semibold text-accent-ink" : "border-rule bg-sheet text-muted hover:text-ink",
      )}
    >
      {dot && <span className={cx("h-2 w-2 shrink-0 rounded-full", dot)} aria-hidden />}
      <span className="lg:flex-1">{text}</span>
      {count !== undefined && <span className="tabular-nums opacity-70">{count}</span>}
    </button>
  );

  return (
    <div className="grid items-start gap-3 lg:grid-cols-[11.5rem_minmax(0,1fr)] lg:gap-5">
      <div
        className="sticky top-24 z-[5] -mx-4 flex gap-1.5 overflow-x-auto bg-paper/95 px-4 py-2 backdrop-blur lg:top-28 lg:mx-0 lg:flex-col lg:overflow-visible lg:bg-transparent lg:p-0 lg:backdrop-blur-none"
        role="tablist"
      >
        {FILTERS.filter((f) => f.key === "all" || counts[f.key]).map((f) =>
          button(f.key, f.label, f.key === "all" ? undefined : DOT[f.key], counts[f.key] ?? 0),
        )}
        {extras.length > 0 && <span className="mx-1 w-px shrink-0 bg-rule lg:mx-0 lg:my-1.5 lg:h-px lg:w-full" aria-hidden />}
        {extras.map((x) => button(x.key, x.label, undefined, x.meta))}
      </div>
      <section
        id="student-section"
        role="tabpanel"
        aria-label={label}
        className="flex min-w-0 flex-col gap-4 rounded-2xl border border-rule bg-paper p-3 sm:p-5"
      >
        <h2 className="font-display text-[22px] font-semibold">{label}</h2>
        {extra ? (
          extra.node
        ) : (
          <>
            {days.length === 0 && <p className="text-[16px] text-muted">Nothing here yet.</p>}
            <ol className="flex flex-col gap-5">
              {days.map((d) => (
                <li key={d.day} className="relative ml-1.5 border-l-2 border-rule pl-4">
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
            {footer}
          </>
        )}
      </section>
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
