"use client";

import { type ReactNode, useState } from "react";
import { cx } from "@/components/ui";

export type WeekView = { offset: number; title: string; body: ReactNode };

// The Downbeat week. Every week in range arrives with the page, so Earlier,
// This week and Later swap weeks on the phone with no trip to the server.
// The address bar keeps ?w= so a refresh or a shared link opens the same
// week. Anything that changes a lesson re-renders the page on the server,
// so all weeks stay fresh.
export function WeekSwitcher({ weeks, initial }: { weeks: WeekView[]; initial: number }) {
  const [offset, setOffset] = useState(initial);
  const min = weeks[0]?.offset ?? 0;
  const max = weeks[weeks.length - 1]?.offset ?? 0;
  const week = weeks.find((w) => w.offset === offset) ?? weeks.find((w) => w.offset === 0) ?? weeks[0];

  // Follow the server if it sends a different starting week (a link to ?w=).
  const [seen, setSeen] = useState(initial);
  if (seen !== initial) {
    setSeen(initial);
    setOffset(initial);
  }

  function go(next: number) {
    const o = Math.max(min, Math.min(max, next));
    setOffset(o);
    try {
      const url = new URL(window.location.href);
      if (o === 0) url.searchParams.delete("w");
      else url.searchParams.set("w", String(o));
      window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    } catch {
      // The address bar is a convenience; the week still changes.
    }
  }

  if (!week) return null;
  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="min-w-0 truncate whitespace-nowrap text-lg font-semibold">{week.title}</h2>
        <div className="flex shrink-0 items-center gap-1 text-[15px]">
          <ArrowButton label="Earlier week" disabled={offset <= min} onClick={() => go(offset - 1)}>
            ‹
          </ArrowButton>
          <button
            type="button"
            onClick={() => go(0)}
            className={cx(
              "min-h-10 whitespace-nowrap rounded-full px-3 font-medium text-accent-ink hover:bg-accent-soft",
              offset === 0 && "invisible",
            )}
            tabIndex={offset === 0 ? -1 : undefined}
          >
            This week
          </button>
          <ArrowButton label="Later week" disabled={offset >= max} onClick={() => go(offset + 1)}>
            ›
          </ArrowButton>
        </div>
      </div>
      {week.body}
    </section>
  );
}

function ArrowButton({
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
