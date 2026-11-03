import type { PracticeWeek } from "@/lib/data";
import type { PracticeDay } from "@/lib/practice/data";
import { parseISODate, todayISO } from "@/lib/format";
import { PracticeDayCell } from "./practice-day-popup";
import { cx } from "./ui";

// One circle per day, oldest first, with the weekday above and the date
// inside. Filled when practice was logged that day. When `days` is given, a
// day with practice on record opens a popup with its sessions and grade.
export function WeekStrip({
  week,
  large,
  days,
  teacherView = false,
}: {
  week: PracticeWeek;
  large?: boolean;
  days?: Record<string, PracticeDay>;
  teacherView?: boolean;
}) {
  const today = todayISO();
  return (
    <div className="grid grid-cols-7 gap-1.5">
      {week.days.map((day) => {
        const log = week.logs.find((l) => l.practice_date === day);
        const practiced = !!log && ((log.minutes ?? 0) > 0 || log.completed_assignment_ids.length > 0);
        const d = parseISODate(day);
        const letter = d.toLocaleDateString("en-US", { weekday: "narrow" });
        const recorded = (days?.[day]?.sessions.length ?? 0) > 0;
        return (
          <div key={day} className="flex flex-col items-center gap-1">
            <span className="text-[11px] leading-none text-muted">{letter}</span>
            <PracticeDayCell
              day={days?.[day]}
              teacherView={teacherView}
              title={`${day}${log?.minutes ? ` · ${log.minutes} min` : ""}${recorded ? " · recorded" : ""}`}
              className={cx(
                "relative flex items-center justify-center rounded-full border text-xs font-semibold",
                large ? "h-10 w-10 text-sm" : "h-8 w-8",
                practiced
                  ? "border-sage bg-sage text-white"
                  : day === today
                    ? "border-accent text-accent-ink"
                    : "border-rule text-muted",
                recorded && "ring-2 ring-plum/60 ring-offset-1 ring-offset-paper",
              )}
            >
              {d.getDate()}
            </PracticeDayCell>
            {log?.listened && <span className="h-1.5 w-1.5 rounded-full bg-plum" title="listened" />}
          </div>
        );
      })}
    </div>
  );
}
