"use server";

import { revalidatePath } from "next/cache";
import { requireTeacher } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

// Downbeat schedule changes. Row-level security keeps every row to the
// teacher's own students; these only check the shape of what was sent.

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const date = (fd: FormData, k: string) => (ISO_DATE.test(str(fd, k)) ? str(fd, k) : null);
const time = (fd: FormData, k: string) => (TIME.test(str(fd, k).slice(0, 5)) ? str(fd, k).slice(0, 5) : null);
function minutes(fd: FormData): number {
  const n = Math.round(Number(str(fd, "minutes")));
  return Number.isFinite(n) && n >= 5 && n <= 240 ? n : 30;
}

function done() {
  revalidatePath("/downbeat");
}

/** A new regular weekly lesson for a student. */
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
  });
  done();
}

/** Stop a regular lesson (removes it and its one-off changes). */
export async function removeSlot(fd: FormData) {
  await requireTeacher();
  const id = str(fd, "slot_id");
  if (!id) return;
  const supabase = await createClient();
  await supabase.from("lesson_slots").delete().eq("id", id);
  done();
}

/** Cancel one week's lesson, or move it to another date and time. */
export async function changeLesson(fd: FormData) {
  const { teacher } = await requireTeacher();
  const studentId = str(fd, "student_id");
  const slotId = str(fd, "slot_id");
  const onDate = date(fd, "on_date");
  const kind = str(fd, "kind");
  if (!studentId || !slotId || !onDate || (kind !== "cancel" && kind !== "move")) return;
  const newDate = kind === "move" ? date(fd, "new_date") : null;
  const newTime = kind === "move" ? time(fd, "new_time") : null;
  if (kind === "move" && (!newDate || !newTime)) return;
  const supabase = await createClient();
  // One change per slot per week: replace whatever was there.
  await supabase.from("lesson_slot_changes").delete().eq("slot_id", slotId).eq("on_date", onDate);
  await supabase.from("lesson_slot_changes").insert({
    teacher_id: teacher.id,
    student_id: studentId,
    slot_id: slotId,
    kind,
    on_date: onDate,
    new_date: newDate,
    new_time: newTime,
    minutes: kind === "move" ? minutes(fd) : null,
    note: str(fd, "note").slice(0, 200),
  });
  done();
}

/** Undo a cancel or move, or remove a one-off lesson. */
export async function undoChange(fd: FormData) {
  await requireTeacher();
  const id = str(fd, "change_id");
  if (!id) return;
  const supabase = await createClient();
  await supabase.from("lesson_slot_changes").delete().eq("id", id);
  done();
}

/** A one-off lesson outside the regular schedule. */
export async function addExtraLesson(fd: FormData) {
  const { teacher } = await requireTeacher();
  const studentId = str(fd, "student_id");
  const onDate = date(fd, "on_date");
  const start = time(fd, "start_time");
  if (!studentId || !onDate || !start) return;
  const supabase = await createClient();
  await supabase.from("lesson_slot_changes").insert({
    teacher_id: teacher.id,
    student_id: studentId,
    kind: "extra",
    on_date: onDate,
    new_time: start,
    minutes: minutes(fd),
  });
  done();
}
