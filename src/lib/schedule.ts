// The teacher's lesson schedule (Downbeat): regular weekly slots per student,
// plus one-off changes (a cancelled week, a moved lesson, an extra lesson).
// Pure helpers, shared by the server page and its actions.

import { STUDIO_TIME_ZONE, addDays, parseISODate } from "@/lib/format";

export const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export type Slot = {
  id: string;
  student_id: string;
  /** 0 = Sunday … 6 = Saturday. */
  weekday: number;
  /** "HH:MM" or "HH:MM:SS", studio time; null when unknown (fallback slots only). */
  start_time: string | null;
  minutes: number;
  starts_on: string | null;
  ends_on: string | null;
  /** Made up from the student's "Lesson day"/"Lesson time" fields, not saved. */
  fallback?: boolean;
};

export type SlotChange = {
  id: string;
  student_id: string;
  slot_id: string | null;
  kind: "cancel" | "move" | "extra";
  on_date: string;
  new_date: string | null;
  new_time: string | null;
  minutes: number | null;
  note: string;
};

export type Occurrence = {
  key: string;
  studentId: string;
  date: string;
  /** "HH:MM", or null when the time is not known. */
  time: string | null;
  minutes: number;
  slotId: string | null;
  /** regular: as scheduled. moved: moved here from `from`. extra: one-off. cancelled: off this week. */
  kind: "regular" | "moved" | "extra" | "cancelled";
  /** The slot's own date (cancel/move): what a change is keyed on. */
  slotDate: string | null;
  /** For a moved lesson, the date it was moved from. */
  from: string | null;
  changeId: string | null;
  fallback: boolean;
};

const hm = (t: string | null | undefined) => (t ? t.slice(0, 5) : null);

function slotRuns(slot: Slot, date: string): boolean {
  if (parseISODate(date).getDay() !== slot.weekday) return false;
  if (slot.starts_on && date < slot.starts_on) return false;
  if (slot.ends_on && date > slot.ends_on) return false;
  return true;
}

/** Every lesson between two dates (inclusive), sorted by date and time. Cancelled ones are kept, marked. */
export function occurrencesBetween(slots: Slot[], changes: SlotChange[], from: string, to: string): Occurrence[] {
  const out: Occurrence[] = [];
  const bySlotDate = new Map<string, SlotChange>();
  for (const c of changes) if (c.slot_id && c.kind !== "extra") bySlotDate.set(`${c.slot_id}:${c.on_date}`, c);
  const slotById = new Map(slots.map((s) => [s.id, s]));

  for (let d = from; d <= to; d = addDays(d, 1)) {
    for (const s of slots) {
      if (!slotRuns(s, d)) continue;
      const change = bySlotDate.get(`${s.id}:${d}`);
      if (change?.kind === "move") continue; // shown on its new date below
      out.push({
        key: `${s.id}:${d}`,
        studentId: s.student_id,
        date: d,
        time: hm(s.start_time),
        minutes: s.minutes,
        slotId: s.id,
        kind: change?.kind === "cancel" ? "cancelled" : "regular",
        slotDate: d,
        from: null,
        changeId: change?.id ?? null,
        fallback: !!s.fallback,
      });
    }
  }
  for (const c of changes) {
    if (c.kind === "move" && c.new_date && c.new_date >= from && c.new_date <= to) {
      const s = c.slot_id ? slotById.get(c.slot_id) : undefined;
      if (!s) continue;
      out.push({
        key: `${c.id}:moved`,
        studentId: c.student_id,
        date: c.new_date,
        time: hm(c.new_time) ?? hm(s.start_time),
        minutes: c.minutes ?? s.minutes,
        slotId: s.id,
        kind: "moved",
        slotDate: c.on_date,
        from: c.on_date,
        changeId: c.id,
        fallback: false,
      });
    }
    if (c.kind === "extra" && c.on_date >= from && c.on_date <= to) {
      out.push({
        key: `${c.id}:extra`,
        studentId: c.student_id,
        date: c.on_date,
        time: hm(c.new_time),
        minutes: c.minutes ?? 30,
        slotId: null,
        kind: "extra",
        slotDate: null,
        from: null,
        changeId: c.id,
        fallback: false,
      });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? "99").localeCompare(b.time ?? "99"));
}

/** "16:30" → "4:30 pm". */
export function formatTime(t: string | null | undefined): string {
  if (!t) return "time not set";
  const [h, m] = t.split(":").map(Number);
  const ap = h >= 12 ? "pm" : "am";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ap}`;
}

/** "16:30" + 30 → "5:00 pm". */
export function endTime(t: string | null, minutes: number): string | null {
  if (!t) return null;
  const total = toMinutes(t) + minutes;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export function toMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
}

/** Minutes after midnight right now, in the studio's time zone. */
export function nowMinutes(): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: STUDIO_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return h * 60 + m;
}

/** Monday of the week holding `date`. */
export function weekStart(date: string): string {
  const day = parseISODate(date).getDay();
  return addDays(date, -((day + 6) % 7));
}

/**
 * A student's "Lesson day" and "Lesson time" text fields ("Tuesday",
 * "4:30 PM") read as a weekly slot, for before the schedule tables exist or
 * for students with no saved slot.
 */
export function fallbackSlot(student: { id: string; lesson_day: string | null; lesson_time: string | null }): Slot | null {
  const day = student.lesson_day?.trim().toLowerCase() ?? "";
  const weekday = WEEKDAY_NAMES.findIndex((w) => day.startsWith(w.slice(0, 3).toLowerCase()));
  if (weekday < 0) return null;
  return {
    id: `usual-${student.id}`,
    student_id: student.id,
    weekday,
    start_time: parseTimeText(student.lesson_time),
    minutes: 30,
    starts_on: null,
    ends_on: null,
    fallback: true,
  };
}

/** "4:30 pm", "16:30", "4pm" → "16:30"; music lessons are afternoons, so a bare 1–7 reads as pm. */
export function parseTimeText(text: string | null | undefined): string | null {
  const m = text?.trim().toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?\s*(a|p)?/);
  if (!m) return null;
  let h = Number(m[1]) % 24;
  const min = Math.min(59, Number(m[2] ?? 0));
  if (m[3] === "p" && h < 12) h += 12;
  if (m[3] === "a" && h === 12) h = 0;
  if (!m[3] && h >= 1 && h <= 7) h += 12;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/** "Tue 4:30 pm · 30 min" */
export function slotLabel(slot: Slot): string {
  return `${WEEKDAY_NAMES[slot.weekday].slice(0, 3)} ${formatTime(slot.start_time)} · ${slot.minutes} min`;
}

/** "in 1 h 20 min", "in 15 min", "now". */
export function untilLabel(minutes: number): string {
  if (minutes <= 0) return "now";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `in ${h ? `${h} h ` : ""}${h && !m ? "" : `${m} min`}`.trim();
}
