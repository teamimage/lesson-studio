"use client";

import Link from "next/link";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { cx } from "@/components/ui";

export type TimelineKind = "lesson" | "practice" | "video" | "review";
export type TimelineEntry = {
  key: string;
  kind: TimelineKind;
  /** Heading for the day group, e.g. "Tue, Nov 3". */
  day: string;
  /** The day as YYYY-MM-DD, for "the last 10 days". */
  date: string;
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
 * family) sit under the timeline buttons. Each entry's title opens its own
 * page; its first few lines show, and "Show more" opens the rest in place.
 */
export function Timeline({
  entries,
  initial = "all",
  extras = [],
  footer,
  headingNote,
}: {
  entries: TimelineEntry[];
  initial?: string;
  extras?: ExtraSection[];
  /** Shown under the timeline sections only (e.g. "See all history"). */
  footer?: ReactNode;
  /** Shown after the section name in the box heading, e.g. "· last 10 days". */
  headingNote?: ReactNode;
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
        <h2 className="font-display text-[22px] font-semibold">{label}
          {!extra && headingNote && <span className="font-sans text-[15px] font-normal text-muted"> · {headingNote}</span>}</h2>
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

const FADE: Record<"sheet" | "amber" | "plum", string> = {
  sheet: "from-sheet",
  amber: "from-amber-soft",
  plum: "from-plum-soft",
};

/**
 * One timeline entry: the title (a link to the entry's own page, when it has
 * one) with its badge right after it, a short meta line, then the detail. A
 * long detail shows its first six lines or so, fading out, with "Show more"
 * centred on the cut-off line to open the rest in place (and close it again).
 */
export function Entry({
  title,
  href,
  meta,
  badge,
  tone = "sheet",
  children,
}: {
  title: ReactNode;
  href?: string;
  meta?: ReactNode;
  badge?: ReactNode;
  tone?: "sheet" | "amber" | "plum";
  children?: ReactNode;
}) {
  const body = useRef<HTMLDivElement>(null);
  const [long, setLong] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const el = body.current;
    if (!el) return;
    const check = () => setLong(el.scrollHeight > el.clientHeight + 4 || el.dataset.open === "1");
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <article
      className={cx(
        "rounded-2xl border",
        tone === "amber" ? "border-amber/25 bg-amber-soft" : tone === "plum" ? "border-plum/20 bg-plum-soft" : "border-rule bg-sheet",
      )}
    >
      <div className="px-4 pt-3 pb-2">
        <h3 className="text-[17px] font-semibold leading-snug">
          {href ? (
            <Link href={href} className="underline decoration-rule decoration-2 underline-offset-4 hover:decoration-accent">
              {title}
            </Link>
          ) : (
            title
          )}
          {badge && <span className="ml-2 inline-block align-[0.1em]">{badge}</span>}
        </h3>
        {meta && <p className="mt-0.5 text-sm text-muted">{meta}</p>}
      </div>
      {children && (
        <div className="relative">
          <div
            ref={body}
            data-open={open ? "1" : "0"}
            className={cx("flex flex-col gap-3 px-4 pb-3 text-[16px] leading-normal", !open && "max-h-[9.5rem] overflow-hidden")}
          >
            {children}
          </div>
          {long && !open && (
            <div
              aria-hidden
              className={cx("pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t to-transparent", FADE[tone])}
            />
          )}
        </div>
      )}
      {children && long && (
        <div className="relative flex items-center justify-center px-4 pb-3">
          <span aria-hidden className="absolute inset-x-4 top-1/2 h-px -translate-y-1/2 bg-rule" />
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            className="relative flex min-h-9 items-center gap-1.5 rounded-full border border-rule bg-paper px-4 text-sm font-medium text-accent-ink"
          >
            {open ? "Show less" : "Show more"}
            <span aria-hidden className={cx("inline-block transition-transform", open && "rotate-180")}>
              ▾
            </span>
          </button>
        </div>
      )}
    </article>
  );
}
