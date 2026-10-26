import type { PracticeWeek } from "@/lib/data";
import { parseISODate, todayISO } from "@/lib/format";
import { cx } from "./ui";

// Seven circles, oldest first. Filled when practice was logged that day.
export function WeekStrip({ week, large }: { week: PracticeWeek; large?: boolean }) {
  const today = todayISO();
  return (
    <div className="grid grid-cols-7 gap-1.5">
      {week.days.map((day) => {
        const log = week.logs.find((l) => l.practice_date === day);
        const practiced = !!log && ((log.minutes ?? 0) > 0 || log.completed_assignment_ids.length > 0);
        const d = parseISODate(day);
        const letter = d.toLocaleDateString("en-US", { weekday: "narrow" });
        return (
          <div key={day} className="flex flex-col items-center gap-1">
            <div
              className={cx(
                "flex items-center justify-center rounded-full border text-xs font-semibold",
                large ? "h-10 w-10 text-sm" : "h-8 w-8",
                practiced
                  ? "border-sage bg-sage text-white"
                  : day === today
                    ? "border-accent text-accent-ink"
                    : "border-rule text-muted",
              )}
              title={day}
            >
              {practiced ? "✓" : letter}
            </div>
            {log?.listened && <span className="h-1.5 w-1.5 rounded-full bg-plum" title="listened" />}
          </div>
        );
      })}
    </div>
  );
}
