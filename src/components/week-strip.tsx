import type { PracticeWeek } from "@/lib/data";
import type { PracticeDay } from "@/lib/practice/data";
import { parseISODate, todayISO } from "@/lib/format";
import type { LessonMark } from "@/lib/lesson-mark-types";
import { LessonNote, PracticeDayCell } from "./practice-day-popup";
import { cx } from "./ui";

// One circle per day, oldest first, with the weekday above and the date
// inside. Filled when practice was logged that day. When `days` is given, a
// day with practice on record opens a popup with its sessions and grade.
// Lesson days (from `lessons`) carry a terracotta note and open the popup too.
export function WeekStrip({
  week,
  large,
  days,
  lessons,
  teacherView = false,
}: {
  week: PracticeWeek;
  large?: boolean;
  days?: Record<string, PracticeDay>;
  lessons?: Record<string, LessonMark[]>;
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
        const noRecording = !!days?.[day]?.noRecording;
        const lessonMarks = lessons?.[day];
        const lesson = lessonMarks?.[0];
        return (
          <div key={day} className="flex flex-col items-center gap-1">
            <span className="text-[11px] leading-none text-muted">{letter}</span>
            <PracticeDayCell
              day={days?.[day]}
              date={day}
              lessons={lessonMarks}
              teacherView={teacherView}
              title={`${day}${lesson ? (lesson.upcoming ? " · lesson coming up" : " · lesson") : ""}${log?.minutes ? ` · ${log.minutes} min` : ""}${recorded ? " · recorded" : ""}${noRecording ? " · no recording" : ""}`}
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
              {noRecording && (
                <span
                  className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-danger text-[10px] font-bold leading-none text-white ring-2 ring-paper"
                  aria-label="logged without a recording"
                >
                  !
                </span>
              )}
              {lesson && (
                <span className="absolute -right-1 -bottom-1 flex rounded-full ring-2 ring-paper">
                  <LessonNote small upcoming={lesson.upcoming} />
                </span>
              )}
            </PracticeDayCell>
            {log?.listened && <span className="h-1.5 w-1.5 rounded-full bg-plum" title="listened" />}
          </div>
        );
      })}
    </div>
  );
}
