import "server-only";
import type { Student } from "@/lib/data";
import { STUDIO_TIME_ZONE, addDays } from "@/lib/format";
import {
  type Closure,
  type Occurrence,
  type Slot,
  type SlotChange,
  fallbackSlot,
  isOn,
  nextOccurrence,
  occurrencesBetween,
} from "@/lib/schedule";
import { createClient } from "@/lib/supabase/server";

export type Schedule = {
  /** False until admin/lesson-schedule.sql has been run: slots then come from each student's text fields. */
  ready: boolean;
  /** True once admin/schedule-foundation.sql has run (closures, make-ups, every other week, calendar links). */
  foundation: boolean;
  slots: Slot[];
  changes: SlotChange[];
  closures: Closure[];
};

export type ScheduleSettings = {
  timeZone: string;
  /** A family cancellation with at least this many hours' notice earns a make-up. */
  noticeHours: number;
};

export const DEFAULT_SETTINGS: ScheduleSettings = { timeZone: STUDIO_TIME_ZONE, noticeHours: 24 };

const NO_ID = "00000000-0000-0000-0000-000000000000";

/**
 * The weekly slots, recent changes and studio closures for these students.
 * Students with no saved slot fall back to their "Lesson day"/"Lesson time"
 * fields so they still show. Works for teachers and, through the database
 * rules, for parents reading their own children.
 */
export async function loadSchedule(students: Pick<Student, "id" | "lesson_day" | "lesson_time">[], from: string): Promise<Schedule> {
  const supabase = await createClient();
  const ids = students.map((s) => s.id);
  const since = addDays(from, -60);
  const [slotRes, changeRes, closureRes] = await Promise.all([
    supabase.from("lesson_slots").select("*").in("student_id", ids.length ? ids : [NO_ID]),
    supabase
      .from("lesson_slot_changes")
      .select("*")
      .in("student_id", ids.length ? ids : [NO_ID])
      .or(`on_date.gte.${since},new_date.gte.${since}`),
    supabase.from("studio_closures").select("*").gte("ends_on", since),
  ]);
  const ready = !slotRes.error && !changeRes.error;
  const saved: Slot[] = ready ? ((slotRes.data ?? []) as Slot[]) : [];
  const withSlot = new Set(saved.map((s) => s.student_id));
  const fallbacks = students
    .filter((s) => !withSlot.has(s.id))
    .map(fallbackSlot)
    .filter((s): s is Slot => !!s);
  return {
    ready,
    foundation: ready && !closureRes.error,
    slots: [...saved, ...fallbacks],
    changes: ready ? ((changeRes.data ?? []) as SlotChange[]) : [],
    closures: closureRes.error ? [] : ((closureRes.data ?? []) as Closure[]),
  };
}

/** Every lesson for these students between two dates, from one schedule load. */
export function scheduleBetween(schedule: Schedule, from: string, to: string): Occurrence[] {
  return occurrencesBetween(schedule.slots, schedule.changes, from, to, schedule.closures);
}

/** Upcoming lessons (today and the next `days` days), grouped by student. */
export async function loadUpcoming(
  students: Pick<Student, "id" | "lesson_day" | "lesson_time">[],
  today: string,
  days = 60,
): Promise<Map<string, Occurrence[]>> {
  const out = new Map<string, Occurrence[]>(students.map((s) => [s.id, []]));
  try {
    const schedule = await loadSchedule(students, today);
    for (const o of scheduleBetween(schedule, today, addDays(today, days))) out.get(o.studentId)?.push(o);
  } catch {
    // No schedule: every list stays empty.
  }
  return out;
}

/** The teacher's time zone and make-up notice, or the defaults before schedule-foundation.sql. */
export async function loadScheduleSettings(teacherId: string): Promise<ScheduleSettings> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("teachers")
    .select("time_zone, makeup_notice_hours")
    .eq("id", teacherId)
    .maybeSingle();
  if (error || !data) return DEFAULT_SETTINGS;
  return {
    timeZone: data.time_zone || DEFAULT_SETTINGS.timeZone,
    noticeHours: data.makeup_notice_hours ?? DEFAULT_SETTINGS.noticeHours,
  };
}

/**
 * A student's next lesson after a date (the day after a lesson, for its
 * sheet) or from today, from the schedule. Null when nothing is scheduled.
 */
export async function nextScheduledLesson(
  student: Pick<Student, "id" | "lesson_day" | "lesson_time">,
  today: string,
  after?: string,
): Promise<Occurrence | null> {
  try {
    const schedule = await loadSchedule([student], after && after < today ? after : today);
    if (after) {
      return scheduleBetween(schedule, addDays(after, 1), addDays(after, 60)).find(isOn) ?? null;
    }
    return nextOccurrence(scheduleBetween(schedule, today, addDays(today, 60)), today);
  } catch {
    return null;
  }
}
