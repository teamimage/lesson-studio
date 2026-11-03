import Link from "next/link";
import type { ReactNode } from "react";
import type { PracticeLog } from "@/lib/data";
import { addDays, formatDate, parseISODate } from "@/lib/format";
import { practiced } from "@/lib/teacher-data";
import type { PracticeDay } from "@/lib/practice/data";
import { PracticeDayCell } from "./practice-day-popup";
import { cx } from "./ui";

// Pieces shared by the teacher desk pages.

export function Stat({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-2xl border border-rule bg-sheet px-3 py-2.5">
      <div className="text-[12px] font-semibold uppercase tracking-[0.1em] text-accent-ink">{label}</div>
      <div className="mt-0.5 text-lg font-semibold leading-tight">{value}</div>
      <div className="text-xs text-muted">{detail}</div>
    </div>
  );
}

export function Info({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[96px_1fr] gap-3 px-4 py-2.5">
      <div className="pt-0.5 text-[12px] font-semibold uppercase tracking-[0.1em] text-accent-ink">{label}</div>
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
export function PracticeGrid({
  logs,
  today,
  days,
  teacherView = false,
}: {
  logs: PracticeLog[];
  today: string;
  /** Logs and recorded sessions by date; days in it open a popup when tapped. */
  days?: Record<string, PracticeDay>;
  teacherView?: boolean;
}) {
  const start = addDays(today, -27);
  const weeks = Array.from({ length: 4 }, (_, w) => Array.from({ length: 7 }, (_, d) => addDays(start, w * 7 + d)));
  return (
    <div className="flex flex-col gap-1.5">
      <div className="grid grid-cols-[52px_repeat(7,minmax(0,1fr))] gap-1.5 text-center text-[12px] text-muted">
        <span />
        {weeks[0].map((d) => (
          <span key={d}>{parseISODate(d).toLocaleDateString("en-US", { weekday: "narrow" })}</span>
        ))}
      </div>
      {weeks.map((week) => (
        <div key={week[0]} className="grid grid-cols-[52px_repeat(7,minmax(0,1fr))] items-center gap-1.5">
          <span className="text-[12px] text-muted">{formatDate(week[0])}</span>
          {week.map((d) => {
            const log = logs.find((l) => l.practice_date === d);
            const did = practiced(log);
            const short = did && (log?.minutes ?? 0) > 0 && (log?.minutes ?? 0) < 10;
            const sessions = days?.[d]?.sessions.length ?? 0;
            return (
              <PracticeDayCell
                key={d}
                day={days?.[d]}
                teacherView={teacherView}
                title={`${formatDate(d, "weekday")}${log?.minutes ? ` · ${log.minutes} min` : ""}${log?.listened ? " · listened" : ""}${sessions ? ` · ${sessions} recorded` : ""}`}
                className={cx(
                  "relative flex h-11 flex-col items-center justify-center rounded-lg",
                  did ? (short ? "bg-sage/40 text-ink" : "bg-sage text-white") : "bg-rule/50 text-muted",
                  d === today && "ring-2 ring-accent",
                )}
              >
                <span className={cx("absolute top-0.5 left-1 text-[10px] leading-none", did ? "opacity-80" : "")}>
                  {parseISODate(d).getDate()}
                </span>
                <span className="mt-1 text-[13px] font-semibold leading-none">{log?.minutes ? log.minutes : ""}</span>
                {log?.listened && <span className="absolute bottom-0.5 h-1 w-1 rounded-full bg-plum" />}
                {sessions > 0 && <span className="absolute top-0.5 right-1 text-[9px] leading-none" aria-hidden>●</span>}
              </PracticeDayCell>
            );
          })}
        </div>
      ))}
    </div>
  );
}
