"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTeacher } from "@/lib/auth";
import { listStudents } from "@/lib/data";
import { addDays } from "@/lib/format";
import { occurrencesBetween, type Slot, type SlotChange } from "@/lib/schedule";
import { createClient } from "@/lib/supabase/server";

// Schedule changes (Intro, Settings → Lesson times, a lesson's own schedule
// page). Row-level security keeps every row to the teacher's own students;
// these only check the shape of what was sent.

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const date = (fd: FormData, k: string) => (ISO_DATE.test(str(fd, k)) ? str(fd, k) : null);
const time = (fd: FormData, k: string) => (TIME.test(str(fd, k).slice(0, 5)) ? str(fd, k).slice(0, 5) : null);
function minutes(fd: FormData): number {
  const n = Math.round(Number(str(fd, "minutes")));
  return Number.isFinite(n) && n >= 5 && n <= 240 ? n : 30;
}
/** every_weeks, only when the form sent it (the field exists once schedule-foundation.sql has run). */
function every(fd: FormData): { every_weeks?: number } {
  if (!fd.has("every_weeks")) return {};
  const n = Math.round(Number(str(fd, "every_weeks")));
  return { every_weeks: n >= 1 && n <= 4 ? n : 1 };
}
const yes = (fd: FormData, k: string) => ["1", "on", "yes", "true"].includes(str(fd, k));

function done(fd?: FormData) {
  revalidatePath("/downbeat");
  revalidatePath("/settings/lesson-times");
  revalidatePath("/v3");
  const next = fd ? str(fd, "next") : "";
  // Only our own pages.
  if (next.startsWith("/") && !next.startsWith("//")) redirect(next);
}

/** A new regular weekly (or every-other-week) lesson for a student. */
export async function addSlot(fd: FormData) {
  const { teacher } = await requireTeacher();
  const studentId = str(fd, "student_id");
  const weekday = Number(str(fd, "weekday"));
  const start = time(fd, "start_time");
  if (!studentId || !(weekday >= 0 && weekday <= 6) || !start) return;
  const supabase = await createClient();
  await supabase.from("lesson_slots").insert({
    teacher_id: teacher.id,
    student_id: studentId,
    weekday,
    start_time: start,
    minutes: minutes(fd),
    starts_on: date(fd, "starts_on"),
    ...every(fd),
  });
  done(fd);
}

/**
 * Stop a regular lesson from a date. Lessons before that date stay on the
 * calendar; changes from that date on go. A lesson time that never ran
 * before that date is removed outright.
 */
async function stopSlotFrom(slotId: string, from: string) {
  const supabase = await createClient();
  const { data: slot } = await supabase.from("lesson_slots").select("*").eq("id", slotId).maybeSingle();
  if (!slot) return;
  const firstRun = slot.starts_on ?? slot.created_at.slice(0, 10);
  if (from <= firstRun) {
    await supabase.from("lesson_slots").delete().eq("id", slotId);
    return;
  }
  await supabase.from("lesson_slots").update({ ends_on: addDays(from, -1) }).eq("id", slotId);
  await supabase.from("lesson_slot_changes").delete().eq("slot_id", slotId).gte("on_date", from);
}

export async function stopSlot(fd: FormData) {
  await requireTeacher();
  const id = str(fd, "slot_id");
  const from = date(fd, "from");
  if (!id || !from) return;
  await stopSlotFrom(id, from);
  done(fd);
}

/** Older forms: Remove now means stop from today, keeping past lessons. */
export async function removeSlot(fd: FormData) {
  await requireTeacher();
  const id = str(fd, "slot_id");
  if (!id) return;
  await stopSlotFrom(id, date(fd, "from") ?? new Date().toISOString().slice(0, 10));
  done(fd);
}

/** A new day, time or length from a date on. The old lesson time ends the day before; history stays. */
export async function changeSlotFrom(fd: FormData) {
  const { teacher } = await requireTeacher();
  const id = str(fd, "slot_id");
  const from = date(fd, "from");
  const weekday = Number(str(fd, "weekday"));
  const start = time(fd, "start_time");
  if (!id || !from || !(weekday >= 0 && weekday <= 6) || !start) return;
  const supabase = await createClient();
  const { data: slot } = await supabase.from("lesson_slots").select("*").eq("id", id).maybeSingle();
  if (!slot) return;
  await stopSlotFrom(id, from);
  await supabase.from("lesson_slots").insert({
    teacher_id: teacher.id,
    student_id: slot.student_id,
    weekday,
    start_time: start,
    minutes: minutes(fd),
    starts_on: from,
    ...every(fd),
  });
  done(fd);
}

/** Cancel one week's lesson, move it, or mark a no-show. */
export async function changeLesson(fd: FormData) {
  const { teacher } = await requireTeacher();
  const studentId = str(fd, "student_id");
  const slotId = str(fd, "slot_id");
  const onDate = date(fd, "on_date");
  const kind = str(fd, "kind");
  if (!studentId || !slotId || !onDate || !["cancel", "move", "noshow"].includes(kind)) return;
  const newDate = kind === "move" ? date(fd, "new_date") : null;
  const newTime = kind === "move" ? time(fd, "new_time") : null;
  if (kind === "move" && (!newDate || !newTime)) return;
  const supabase = await createClient();
  // One change per slot per week: replace whatever was there.
  await supabase.from("lesson_slot_changes").delete().eq("slot_id", slotId).eq("on_date", onDate);
  const by = str(fd, "cancelled_by");
  const extras =
    fd.has("makeup_owed") || fd.has("cancelled_by")
      ? {
          // A lesson the teacher cancels is always owed back.
          makeup_owed: kind === "cancel" && by !== "family" ? true : kind !== "move" && yes(fd, "makeup_owed"),
          cancelled_by: kind === "cancel" ? ((by === "family" ? "family" : "teacher") as "family" | "teacher") : null,
        }
      : {};
  await supabase.from("lesson_slot_changes").insert({
    teacher_id: teacher.id,
    student_id: studentId,
    slot_id: slotId,
    kind: kind as "cancel" | "move" | "noshow",
    on_date: onDate,
    new_date: newDate,
    new_time: newTime,
    minutes: kind === "move" ? minutes(fd) : null,
    note: str(fd, "note").slice(0, 200),
    ...extras,
  });
  done(fd);
}

/** Undo a cancel, move or no-show, or remove a one-off lesson. */
export async function undoChange(fd: FormData) {
  await requireTeacher();
  const id = str(fd, "change_id");
  if (!id) return;
  const supabase = await createClient();
  await supabase.from("lesson_slot_changes").delete().eq("id", id);
  done(fd);
}

/** A one-off lesson outside the regular schedule, optionally making up for a cancelled one. */
export async function addExtraLesson(fd: FormData) {
  const { teacher } = await requireTeacher();
  const studentId = str(fd, "student_id");
  const onDate = date(fd, "on_date");
  const start = time(fd, "start_time");
  if (!studentId || !onDate || !start) return;
  const makeupFor = str(fd, "makeup_for");
  const supabase = await createClient();
  await supabase.from("lesson_slot_changes").insert({
    teacher_id: teacher.id,
    student_id: studentId,
    kind: "extra",
    on_date: onDate,
    new_time: start,
    minutes: minutes(fd),
    ...(makeupFor ? { makeup_for: makeupFor } : {}),
  });
  done(fd);
}

/** Move a one-off lesson to another date or time. */
export async function moveExtraLesson(fd: FormData) {
  await requireTeacher();
  const id = str(fd, "change_id");
  const onDate = date(fd, "on_date");
  const start = time(fd, "start_time");
  if (!id || !onDate || !start) return;
  const supabase = await createClient();
  await supabase
    .from("lesson_slot_changes")
    .update({ on_date: onDate, new_time: start, minutes: minutes(fd) })
    .eq("id", id)
    .eq("kind", "extra");
  done(fd);
}

/**
 * Studio closed: every regular lesson in the dates is cancelled by the
 * studio, each with or without a make-up owed. Removing the closure brings
 * them back.
 */
export async function addClosure(fd: FormData) {
  const { teacher } = await requireTeacher();
  const from = date(fd, "starts_on");
  const to = date(fd, "ends_on") ?? from;
  if (!from || !to || to < from) return;
  const makeup = yes(fd, "makeup_owed");
  const note = str(fd, "note").slice(0, 200);
  const supabase = await createClient();
  const { data: closure } = await supabase
    .from("studio_closures")
    .insert({ teacher_id: teacher.id, starts_on: from, ends_on: to, note, makeup_owed: makeup })
    .select("id")
    .single();
  if (!closure) return;
  const students = (await listStudents()).filter((s) => s.active);
  const ids = students.map((s) => s.id);
  if (ids.length) {
    const [{ data: slots }, { data: changes }] = await Promise.all([
      supabase.from("lesson_slots").select("*").in("student_id", ids),
      supabase.from("lesson_slot_changes").select("*").in("student_id", ids).gte("on_date", from).lte("on_date", to),
    ]);
    const taken = new Set((changes ?? []).filter((c) => c.slot_id).map((c) => `${c.slot_id}:${c.on_date}`));
    const rows = occurrencesBetween((slots ?? []) as Slot[], (changes ?? []) as SlotChange[], from, to)
      .filter((o) => o.kind === "regular" && o.slotId && !taken.has(`${o.slotId}:${o.date}`))
      .map((o) => ({
        teacher_id: teacher.id,
        student_id: o.studentId,
        slot_id: o.slotId,
        kind: "cancel" as const,
        on_date: o.date,
        note,
        cancelled_by: "studio" as const,
        makeup_owed: makeup,
        closure_id: closure.id,
      }));
    if (rows.length) await supabase.from("lesson_slot_changes").insert(rows);
  }
  done(fd);
}

export async function removeClosure(fd: FormData) {
  await requireTeacher();
  const id = str(fd, "closure_id");
  if (!id) return;
  const supabase = await createClient();
  await supabase.from("studio_closures").delete().eq("id", id);
  done(fd);
}

/** Time zone and how much notice a family cancellation needs to earn a make-up. */
export async function saveScheduleSettings(fd: FormData) {
  const { teacher } = await requireTeacher();
  const zone = str(fd, "time_zone");
  let valid = true;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
  } catch {
    valid = false;
  }
  const hours = Math.round(Number(str(fd, "makeup_notice_hours")));
  const supabase = await createClient();
  await supabase
    .from("teachers")
    .update({
      ...(valid && zone ? { time_zone: zone } : {}),
      ...(Number.isFinite(hours) && hours >= 0 && hours <= 336 ? { makeup_notice_hours: hours } : {}),
    })
    .eq("id", teacher.id);
  done(fd);
}
