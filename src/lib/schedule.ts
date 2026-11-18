// The teacher's lesson schedule (Downbeat): regular weekly slots per student,
// plus one-off changes (a cancelled week, a moved lesson, an extra lesson).
// Pure helpers, shared by the server page and its actions.

import { STUDIO_TIME_ZONE, addDays, daysBetween, parseISODate } from "@/lib/format";

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
  /** 1 = every week, 2 = every other week (counted from starts_on). Missing before schedule-foundation.sql. */
  every_weeks?: number;
  created_at?: string;
  /** Made up from the student's "Lesson day"/"Lesson time" fields, not saved. */
  fallback?: boolean;
};

export type SlotChange = {
  id: string;
  student_id: string;
  slot_id: string | null;
  kind: "cancel" | "move" | "extra" | "noshow";
  on_date: string;
  new_date: string | null;
  new_time: string | null;
  minutes: number | null;
  note: string;
  /** Who called a cancellation off. Missing before schedule-foundation.sql. */
  cancelled_by?: CancelledBy | null;
  /** A cancellation (or no-show) that earns a make-up lesson. */
  makeup_owed?: boolean;
  /** On a one-off lesson: the cancellation it makes up for. */
  makeup_for?: string | null;
  /** On a cancellation: the studio closure that caused it. */
  closure_id?: string | null;
};

export type CancelledBy = "teacher" | "family" | "studio";

/** Dates the studio is closed (holidays, breaks). */
export type Closure = {
  id: string;
  teacher_id: string;
  starts_on: string;
  ends_on: string;
  note: string;
  makeup_owed: boolean;
};

export type Occurrence = {
  key: string;
  studentId: string;
  date: string;
  /** "HH:MM", or null when the time is not known. */
  time: string | null;
  minutes: number;
  slotId: string | null;
  /** regular: as scheduled. moved: moved here from `from`. extra: one-off. cancelled: off this week. noshow: the student didn't come. */
  kind: "regular" | "moved" | "extra" | "cancelled" | "noshow";
  /** The slot's own date (cancel/move): what a change is keyed on. */
  slotDate: string | null;
  /** For a moved lesson, the date it was moved from. */
  from: string | null;
  changeId: string | null;
  fallback: boolean;
  cancelledBy: CancelledBy | null;
  makeupOwed: boolean;
  /** One-off lessons: the cancellation this one makes up for. */
  makeupFor: string | null;
  note: string;
  /** Other students whose lessons overlap this one (same day, times cross). */
  overlaps: string[];
};

/** The date a slot first ran: its start date, else the day it was made. */
function slotAnchor(slot: Slot): string | null {
  return slot.starts_on ?? (slot.created_at ? slot.created_at.slice(0, 10) : null);
}

const hm = (t: string | null | undefined) => (t ? t.slice(0, 5) : null);

function slotRuns(slot: Slot, date: string): boolean {
  if (parseISODate(date).getDay() !== slot.weekday) return false;
  if (slot.starts_on && date < slot.starts_on) return false;
  if (slot.ends_on && date > slot.ends_on) return false;
  const every = slot.every_weeks ?? 1;
  if (every > 1) {
    const anchor = slotAnchor(slot);
    if (anchor) {
      // The first lesson day on or after the anchor counts as week 0.
      const first = addDays(anchor, (slot.weekday - parseISODate(anchor).getDay() + 7) % 7);
      const weeks = Math.round(daysBetween(first, date) / 7);
      if (weeks < 0 || weeks % every !== 0) return false;
    }
  }
  return true;
}

/** Fresh defaults for each lesson (a new overlaps list every time). */
const base = () => ({ cancelledBy: null, makeupOwed: false, makeupFor: null, note: "", overlaps: [] as string[] });

/** Every lesson between two dates (inclusive), sorted by date and time. Cancelled ones are kept, marked. */
export function occurrencesBetween(
  slots: Slot[],
  changes: SlotChange[],
  from: string,
  to: string,
  closures: Closure[] = [],
): Occurrence[] {
  const out: Occurrence[] = [];
  const bySlotDate = new Map<string, SlotChange>();
  for (const c of changes) if (c.slot_id && c.kind !== "extra") bySlotDate.set(`${c.slot_id}:${c.on_date}`, c);
  const slotById = new Map(slots.map((s) => [s.id, s]));

  for (let d = from; d <= to; d = addDays(d, 1)) {
    for (const s of slots) {
      if (!slotRuns(s, d)) continue;
      const change = bySlotDate.get(`${s.id}:${d}`);
      if (change?.kind === "move") continue; // shown on its new date below
      const closed = change ? null : closures.find((c) => d >= c.starts_on && d <= c.ends_on);
      out.push({
        ...base(),
        key: `${s.id}:${d}`,
        studentId: s.student_id,
        date: d,
        time: hm(s.start_time),
        minutes: s.minutes,
        slotId: s.id,
        kind: change?.kind === "cancel" || closed ? "cancelled" : change?.kind === "noshow" ? "noshow" : "regular",
        slotDate: d,
        from: null,
        changeId: change?.id ?? null,
        fallback: !!s.fallback,
        cancelledBy: closed ? "studio" : change?.kind === "cancel" ? (change.cancelled_by ?? "teacher") : null,
        makeupOwed: !!change?.makeup_owed,
        note: closed ? closed.note : (change?.note ?? ""),
      });
    }
  }
  for (const c of changes) {
    if (c.kind === "move" && c.new_date && c.new_date >= from && c.new_date <= to) {
      const s = c.slot_id ? slotById.get(c.slot_id) : undefined;
      if (!s) continue;
      out.push({
        ...base(),
        note: c.note,
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
        ...base(),
        note: c.note,
        makeupFor: c.makeup_for ?? null,
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
  out.sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? "99").localeCompare(b.time ?? "99"));
  markOverlaps(out);
  return out;
}

/** True for a lesson that takes place (not cancelled, not a no-show). */
export function isOn(o: Occurrence): boolean {
  return o.kind !== "cancelled" && o.kind !== "noshow";
}

/** Fills each lesson's `overlaps` with the students whose lessons cross it. */
function markOverlaps(list: Occurrence[]) {
  const byDate = new Map<string, Occurrence[]>();
  for (const o of list) {
    if (!isOn(o) || !o.time) continue;
    byDate.set(o.date, [...(byDate.get(o.date) ?? []), o]);
  }
  for (const day of byDate.values()) {
    for (const a of day) {
      const a0 = toMinutes(a.time!);
      for (const b of day) {
        if (a === b || a.studentId === b.studentId) continue;
        const b0 = toMinutes(b.time!);
        if (a0 < b0 + b.minutes && b0 < a0 + a.minutes) a.overlaps.push(b.studentId);
      }
    }
  }
}

/** The address of one lesson's own page: a weekly lesson by slot and week, a one-off by its id. */
export function occurrenceRef(o: Pick<Occurrence, "slotId" | "slotDate" | "changeId" | "kind">): string | null {
  if (o.kind === "extra") return o.changeId ? `x_${o.changeId}` : null;
  if (o.slotId && o.slotDate && !o.slotId.startsWith("usual-")) return `${o.slotId}_${o.slotDate}`;
  return null;
}

export function parseOccurrenceRef(ref: string): { slotId: string; date: string } | { changeId: string } | null {
  const x = ref.match(/^x_([0-9a-f-]{36})$/i);
  if (x) return { changeId: x[1] };
  const m = ref.match(/^([0-9a-f-]{36})_(\d{4}-\d{2}-\d{2})$/i);
  return m ? { slotId: m[1], date: m[2] } : null;
}

/**
 * Make-ups still owed: cancellations marked "make-up owed" that no one-off
 * lesson has made up yet.
 */
export function makeupsOwed(changes: SlotChange[], studentId?: string): SlotChange[] {
  const settled = new Set(changes.filter((c) => c.kind === "extra" && c.makeup_for).map((c) => c.makeup_for));
  return changes
    .filter((c) => c.makeup_owed && !settled.has(c.id) && (!studentId || c.student_id === studentId))
    .sort((a, b) => a.on_date.localeCompare(b.on_date));
}

/** "Cancelled by the family", "Studio closed"... */
export function cancelLabel(o: Pick<Occurrence, "kind" | "cancelledBy">): string {
  if (o.kind === "noshow") return "no-show";
  if (o.kind !== "cancelled") return "";
  return o.cancelledBy === "family" ? "family cancelled" : o.cancelledBy === "studio" ? "studio closed" : "cancelled";
}

/** Whole hours from now until a lesson starts, in the given time zone. Negative once it has started. */
export function hoursUntil(date: string, time: string | null, timeZone = STUDIO_TIME_ZONE): number {
  const start = zonedToUtc(date, time ?? "00:00", timeZone);
  return (start.getTime() - Date.now()) / 3_600_000;
}

/** A clock time on a date in a time zone, as a real moment. Handles daylight saving. */
export function zonedToUtc(date: string, time: string, timeZone: string): Date {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  // Offset of the zone at that moment, applied twice to settle across a DST change.
  let t = guess;
  for (let i = 0; i < 2; i++) t = guess - zoneOffsetMs(t, timeZone);
  return new Date(t);
}

function zoneOffsetMs(utcMs: number, timeZone: string): number {
  let tz = timeZone;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
  } catch {
    tz = STUDIO_TIME_ZONE;
  }
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(utcMs / 1000) * 1000;
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
    every_weeks: 1,
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

/** "Every Tuesday at 4:30 pm, 30 min" / "Every other Tuesday ..." */
export function slotSentence(slot: Slot): string {
  const every = slot.every_weeks ?? 1;
  const day = WEEKDAY_NAMES[slot.weekday];
  const lead = every === 1 ? `Every ${day}` : every === 2 ? `Every other ${day}` : `Every ${every} weeks on ${day}`;
  return `${lead} at ${formatTime(slot.start_time)}, ${slot.minutes} min`;
}

/** The first lesson that takes place on or after today and hasn't ended. */
export function nextOccurrence(list: Occurrence[], today: string, now = nowMinutes()): Occurrence | null {
  return (
    list.find(
      (o) =>
        isOn(o) &&
        (o.date > today || (o.date === today && (!o.time || toMinutes(o.time) + o.minutes > now))),
    ) ?? null
  );
}

/** "in 1 h 20 min", "in 15 min", "now". */
export function untilLabel(minutes: number): string {
  if (minutes <= 0) return "now";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `in ${h ? `${h} h ` : ""}${h && !m ? "" : `${m} min`}`.trim();
}
