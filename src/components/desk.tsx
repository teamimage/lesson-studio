import Link from "next/link";
import type { ReactNode } from "react";
import type { PracticeLog } from "@/lib/data";
import { addDays, formatDate, parseISODate } from "@/lib/format";
import { practiced } from "@/lib/teacher-data";
import { cx } from "./ui";

// Pieces shared by the teacher desk pages.

export function Stat({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-2xl border border-rule bg-sheet px-3 py-2.5">
      <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-accent-ink">{label}</div>
      <div className="mt-0.5 text-lg font-semibold leading-tight">{value}</div>
      <div className="text-xs text-muted">{detail}</div>
    </div>
  );
}

export function Info({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[96px_1fr] gap-3 px-4 py-2.5">
      <div className="pt-0.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-accent-ink">{label}</div>
      <div className="min-w-0 whitespace-pre-line">{children}</div>
    </div>
  );
}

/** A big rounded button that opens another desk page. */
export function DeskLink({ href, title, detail }: { href: string; title: string; detail: string }) {
  return (
    <Link
      href={href}
      className="flex min-h-14 items-center gap-3 rounded-2xl border border-accent/30 bg-accent-soft px-4 py-2.5 transition hover:border-accent active:scale-[0.99]"
    >
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-accent-ink">{title}</span>
        <span className="block truncate text-sm text-muted">{detail}</span>
      </span>
      <span className="text-xl text-accent-ink" aria-hidden>
        ›
      </span>
    </Link>
  );
}

// Four weeks of practice, one row per week, oldest at the top.
export function PracticeGrid({ logs, today }: { logs: PracticeLog[]; today: string }) {
  const start = addDays(today, -27);
  const weeks = Array.from({ length: 4 }, (_, w) => Array.from({ length: 7 }, (_, d) => addDays(start, w * 7 + d)));
  return (
    <div className="flex flex-col gap-1.5">
      <div className="grid grid-cols-[52px_repeat(7,minmax(0,1fr))] gap-1.5 text-center text-[11px] text-muted">
        <span />
        {weeks[0].map((d) => (
          <span key={d}>{parseISODate(d).toLocaleDateString("en-US", { weekday: "narrow" })}</span>
        ))}
      </div>
      {weeks.map((days) => (
        <div key={days[0]} className="grid grid-cols-[52px_repeat(7,minmax(0,1fr))] items-center gap-1.5">
          <span className="text-[11px] text-muted">{formatDate(days[0])}</span>
          {days.map((d) => {
            const log = logs.find((l) => l.practice_date === d);
            const did = practiced(log);
            const short = did && (log?.minutes ?? 0) > 0 && (log?.minutes ?? 0) < 10;
            return (
              <div
                key={d}
                title={`${formatDate(d, "weekday")}${log?.minutes ? ` · ${log.minutes} min` : ""}${log?.listened ? " · listened" : ""}`}
                className={cx(
                  "relative flex h-8 items-center justify-center rounded-lg text-[11px] font-semibold",
                  did ? (short ? "bg-sage/40 text-ink" : "bg-sage text-white") : "bg-rule/50 text-muted",
                  d === today && "ring-2 ring-accent",
                )}
              >
                {log?.minutes ? log.minutes : ""}
                {log?.listened && <span className="absolute bottom-0.5 h-1 w-1 rounded-full bg-plum" />}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
