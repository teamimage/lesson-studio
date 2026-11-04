"use client";

import { useRef, useState, useTransition } from "react";
import { parseISODate } from "@/lib/format";
import type { PracticeDay } from "@/lib/practice/data";
import { monthLabel, monthOf, monthWeeks, shiftMonth } from "@/lib/practice/month";
import { type PracticeMonth, loadPracticeMonth } from "@/app/students/practice-month-actions";
import type { LessonMark } from "@/lib/lesson-mark-types";
import { LessonNote, PracticeDayCell } from "./practice-day-popup";
import { cx } from "./ui";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

/**
 * The practice calendar, one month at a time (Sunday first). Arrows or a
 * left/right swipe change month; other months load when first shown. Days
 * from the months either side are faded. Tap a day with practice for its popup.
 * Lesson days carry a terracotta note: filled for a lesson on record, outlined
 * for one still to come from the schedule.
 */
export function PracticeMonthCalendar({
  studentId,
  today,
  initialDays,
  initialLessons = {},
  teacherView = false,
}: {
  studentId: string;
  today: string;
  /** This month's grid, loaded with the page. */
  initialDays: Record<string, PracticeDay>;
  /** This month's lesson days, loaded with the page. */
  initialLessons?: Record<string, LessonMark[]>;
  teacherView?: boolean;
}) {
  const thisMonth = monthOf(today);
  // One month ahead is allowed so the next scheduled lessons show.
  const lastMonth = shiftMonth(thisMonth, 1);
  const [month, setMonth] = useState(thisMonth);
  const [cache, setCache] = useState<Record<string, PracticeMonth>>({
    [thisMonth]: { days: initialDays, lessons: initialLessons },
  });
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();
  const touch = useRef<{ x: number; y: number } | null>(null);

  const days = cache[month]?.days;
  const lessonDays = cache[month]?.lessons;
  const canNext = month < lastMonth;

  function go(n: number) {
    const next = shiftMonth(month, n);
    if (next > lastMonth) return;
    setMonth(next);
    setFailed(false);
    if (cache[next]) return;
    startTransition(async () => {
      try {
        const loaded = await loadPracticeMonth(studentId, next);
        setCache((c) => ({ ...c, [next]: loaded }));
      } catch {
        setFailed(true);
      }
    });
  }

  return (
    <div
      className="flex select-none flex-col gap-1.5 touch-pan-y"
      onTouchStart={(e) => {
        const t = e.touches[0];
        touch.current = { x: t.clientX, y: t.clientY };
      }}
      onTouchEnd={(e) => {
        const start = touch.current;
        touch.current = null;
        if (!start) return;
        const t = e.changedTouches[0];
        const dx = t.clientX - start.x;
        const dy = t.clientY - start.y;
        if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
        go(dx < 0 ? 1 : -1);
      }}
    >
      <div className="mb-1 flex items-center gap-2">
        <button
          type="button"
          onClick={() => go(-1)}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-rule text-lg text-accent-ink transition hover:border-accent active:scale-95"
          aria-label="Previous month"
        >
          ‹
        </button>
        <div className="flex-1 text-center">
          <span className="font-semibold">{monthLabel(month)}</span>
          {month !== thisMonth && (
            <button
              type="button"
              onClick={() => go(monthDiff(month, thisMonth))}
              className="ml-2 text-xs text-accent-ink underline"
            >
              This month
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => go(1)}
          disabled={!canNext}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-rule text-lg text-accent-ink transition hover:border-accent active:scale-95 disabled:pointer-events-none disabled:opacity-30"
          aria-label="Next month"
        >
          ›
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1.5 text-center text-[12px] text-muted">
        {WEEKDAYS.map((d, i) => (
          <span key={i}>{d}</span>
        ))}
      </div>
      {failed && <p className="text-center text-xs text-danger">Couldn&rsquo;t load this month. Try the arrows again.</p>}
      <div className={cx("flex flex-col gap-1.5 transition-opacity", (pending || !days) && "opacity-50")}>
        {monthWeeks(month).map((week) => (
          <div key={week[0]} className="grid grid-cols-7 gap-1.5">
            {week.map((d) => {
              const day = days?.[d];
              const minutes = day?.minutes ?? 0;
              const did = !!day && (minutes > 0 || day.ticked.length > 0);
              const short = did && minutes > 0 && minutes < 10;
              const sessions = day?.sessions.length ?? 0;
              const noRecording = !!day?.noRecording;
              const outside = monthOf(d) !== month;
              const lessons = lessonDays?.[d];
              const lesson = lessons?.[0];
              return (
                <PracticeDayCell
                  key={d}
                  day={day}
                  date={d}
                  lessons={lessons}
                  teacherView={teacherView}
                  title={`${parseISODate(d).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}${lesson ? (lesson.upcoming ? " · lesson coming up" : " · lesson") : ""}${minutes ? ` · ${minutes} min` : ""}${day?.listened ? " · listened" : ""}${sessions ? ` · ${sessions} recorded` : ""}${noRecording ? " · no recording" : ""}`}
                  className={cx(
                    "relative flex h-11 flex-col items-center justify-center rounded-lg",
                    did ? (short ? "bg-sage/40 text-ink" : "bg-sage text-white") : "bg-rule/50 text-muted",
                    d === today && "ring-2 ring-accent",
                    outside && "opacity-40",
                  )}
                >
                  <span className={cx("absolute top-0.5 left-1 text-[10px] leading-none", did ? "opacity-80" : "")}>
                    {parseISODate(d).getDate()}
                  </span>
                  <span className="mt-1 text-[13px] font-semibold leading-none">{minutes ? minutes : ""}</span>
                  {day?.listened && <span className="absolute bottom-0.5 h-1 w-1 rounded-full bg-plum" />}
                  {lesson && (
                    <span className="absolute right-0.5 bottom-0.5 flex">
                      <LessonNote small upcoming={lesson.upcoming} />
                    </span>
                  )}
                  {noRecording ? (
                    <span
                      className="absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-danger text-[9px] font-bold leading-none text-white ring-2 ring-paper"
                      aria-label="logged without a recording"
                    >
                      !
                    </span>
                  ) : (
                    sessions > 0 && (
                      <span className="absolute top-0.5 right-1 text-[9px] leading-none" aria-hidden>
                        ●
                      </span>
                    )
                  )}
                </PracticeDayCell>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function monthDiff(from: string, to: string): number {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  return (ty - fy) * 12 + (tm - fm);
}

/** The key under a practice calendar. */
export function PracticeCalendarLegend() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
      <span className="flex items-center gap-1.5">
        <span className="h-3 w-3 rounded bg-sage" /> practiced
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-3 w-3 rounded bg-sage/40" /> under 10 min
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-plum" /> listened
      </span>
      <span className="flex items-center gap-1.5">
        <span className="text-[9px] leading-none">●</span> recorded session (tap for grade)
      </span>
      <span className="flex items-center gap-1.5">
        <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-danger text-[9px] font-bold text-white">!</span>
        Start/Stop logged, no recording
      </span>
      <span className="flex items-center gap-1.5">
        <LessonNote small /> lesson
      </span>
      <span className="flex items-center gap-1.5">
        <LessonNote small upcoming /> lesson coming up
      </span>
    </div>
  );
}
