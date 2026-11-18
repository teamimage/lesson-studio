"use client";

import Link from "next/link";
import { type ReactNode, useState } from "react";
import { cx } from "@/components/ui";

export type MonthView = { offset: number; title: string; body: ReactNode };

// Intro's calendar: a Week / Month switch and the link to the full calendar
// above it. Both views arrive with the page, so switching is instant; the
// address bar keeps ?cal=month and ?m= so a refresh opens the same view.
export function IntroCalendar({
  week,
  months,
  initialView,
  initialMonth,
  addHref,
}: {
  week: ReactNode;
  months: MonthView[];
  initialView: "week" | "month";
  initialMonth: number;
  addHref: string;
}) {
  const [view, setView] = useState(initialView);
  const [offset, setOffset] = useState(initialMonth);
  const min = months[0]?.offset ?? 0;
  const max = months[months.length - 1]?.offset ?? 0;
  const month =
    months.find((m) => m.offset === offset) ??
    months.find((m) => m.offset === 0) ??
    months[0];

  function remember(key: string, value: string | null) {
    try {
      const url = new URL(window.location.href);
      if (value === null) url.searchParams.delete(key);
      else url.searchParams.set(key, value);
      window.history.replaceState(
        window.history.state,
        "",
        url.pathname + url.search + url.hash,
      );
    } catch {
      // The address bar is a convenience; the view still changes.
    }
  }
  function pick(v: "week" | "month") {
    setView(v);
    remember("cal", v === "month" ? "month" : null);
  }
  function go(next: number) {
    const o = Math.max(min, Math.min(max, next));
    setOffset(o);
    remember("m", o === 0 ? null : String(o));
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div
          className="flex rounded-full border border-rule bg-sheet p-0.5 text-[15px]"
          role="group"
          aria-label="Calendar view"
        >
          {(["week", "month"] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => pick(v)}
              className={cx(
                "flex min-h-10 items-center rounded-full px-4 font-semibold",
                view === v ? "bg-accent-soft text-accent-ink" : "text-muted",
              )}
            >
              {v === "week" ? "Week" : "Month"}
            </button>
          ))}
        </div>
        <Link
          href={`/calendar?view=${view}`}
          className="flex min-h-10 items-center whitespace-nowrap text-[16px] font-semibold text-accent-ink no-underline"
        >
          Full calendar ›
        </Link>
      </div>

      {view === "week"
        ? week
        : month && (
            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <h2 className="min-w-0 truncate whitespace-nowrap text-lg font-semibold">
                  {month.title}
                </h2>
                <div className="flex shrink-0 items-center gap-1 text-[15px]">
                  <Arrow
                    label="Earlier month"
                    disabled={offset <= min}
                    onClick={() => go(offset - 1)}
                  >
                    ‹
                  </Arrow>
                  <button
                    type="button"
                    onClick={() => go(0)}
                    className={cx(
                      "min-h-10 whitespace-nowrap rounded-full px-3 font-medium text-accent-ink hover:bg-accent-soft",
                      offset === 0 && "invisible",
                    )}
                    tabIndex={offset === 0 ? -1 : undefined}
                  >
                    This month
                  </button>
                  <Arrow
                    label="Later month"
                    disabled={offset >= max}
                    onClick={() => go(offset + 1)}
                  >
                    ›
                  </Arrow>
                </div>
              </div>
              {month.body}
            </div>
          )}
      <Link
        href={addHref}
        className="self-start rounded-full border border-rule bg-sheet px-4 py-2 text-[16px] font-semibold text-accent-ink no-underline hover:bg-accent-soft"
      >
        + Add lesson
      </Link>
    </section>
  );
}

function Arrow({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-10 place-items-center rounded-full text-2xl leading-none text-accent-ink hover:bg-accent-soft disabled:opacity-30"
    >
      {children}
    </button>
  );
}
