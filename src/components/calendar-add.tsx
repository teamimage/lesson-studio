"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { addLesson } from "@/app/lessons/live-actions";
import { Button, Input, cx } from "@/components/ui";
import { formatDate, todayISO } from "@/lib/format";

/** The day's practice page, opened ready to enter what was done. */
export function addPracticeHref(studentId: string, date: string, familyMode = false): string {
  return `/v3/students/${studentId}/practice/${date}?edit=1${familyMode ? "&from=family" : ""}`;
}

/**
 * "Add lesson" for a given day: makes (or opens) the lesson on that date as
 * a draft, where the video can be uploaded and notes written. Days after
 * today aren't allowed: a coming lesson belongs in the schedule.
 */
export function AddLessonOnDay({
  studentId,
  date,
  className,
  children,
}: {
  studentId: string;
  date: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <form action={addLesson} className="contents">
      <input type="hidden" name="student_id" value={studentId} />
      <input type="hidden" name="lesson_date" value={date} />
      <input type="hidden" name="local_today" value={todayISO()} />
      <button type="submit" className={className}>
        {children}
      </button>
    </form>
  );
}

/**
 * Under the practice calendar: Add lesson and Add practice. Each asks for
 * the day (today to start with), then opens that lesson or that day's
 * practice page ready to fill in.
 */
export function CalendarAddButtons({
  studentId,
  today,
  canAddLesson,
  familyMode = false,
}: {
  studentId: string;
  today: string;
  canAddLesson: boolean;
  familyMode?: boolean;
}) {
  const router = useRouter();
  const [which, setWhich] = useState<"lesson" | "practice" | null>(null);
  const [date, setDate] = useState(today);
  const pick = (w: "lesson" | "practice") => setWhich((cur) => (cur === w ? null : w));

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {canAddLesson && (
          <Button
            type="button"
            variant="secondary"
            aria-expanded={which === "lesson"}
            onClick={() => pick("lesson")}
            className={cx("min-h-11 flex-1 sm:flex-none", which === "lesson" && "border-accent")}
          >
            + Add lesson
          </Button>
        )}
        <Button
          type="button"
          variant="secondary"
          aria-expanded={which === "practice"}
          onClick={() => pick("practice")}
          className={cx("min-h-11 flex-1 sm:flex-none", which === "practice" && "border-sage")}
        >
          + Add practice
        </Button>
      </div>
      {which && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-sm text-muted">
            {which === "lesson" ? "Lesson day" : "Practice day"}
            <Input
              id={`calendar-add-${which}-date`}
              type="date"
              value={date}
              max={today}
              onChange={(e) => setDate(e.target.value)}
              className="min-h-11"
            />
          </label>
          {which === "lesson" ? (
            <AddLessonOnDay
              studentId={studentId}
              date={date}
              className="min-h-11 rounded-xl bg-accent px-4 font-medium text-white hover:bg-accent-ink disabled:opacity-50"
            >
              Add lesson on {formatDate(date)}
            </AddLessonOnDay>
          ) : (
            <Button
              type="button"
              variant="plum"
              className="min-h-11"
              disabled={!date || date > today}
              onClick={() => router.push(addPracticeHref(studentId, date, familyMode))}
            >
              Add practice on {formatDate(date)}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
