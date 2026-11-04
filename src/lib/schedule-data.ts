import "server-only";
import type { Student } from "@/lib/data";
import { addDays } from "@/lib/format";
import { type Slot, type SlotChange, fallbackSlot } from "@/lib/schedule";
import { createClient } from "@/lib/supabase/server";

export type Schedule = {
  /** False until admin/lesson-schedule.sql has been run: slots then come from each student's text fields. */
  ready: boolean;
  slots: Slot[];
  changes: SlotChange[];
};

/**
 * The teacher's weekly slots and recent changes. Students with no saved slot
 * fall back to their "Lesson day"/"Lesson time" fields so they still show.
 */
export async function loadSchedule(students: Student[], from: string): Promise<Schedule> {
  const supabase = await createClient();
  const ids = students.map((s) => s.id);
  const [slotRes, changeRes] = await Promise.all([
    supabase.from("lesson_slots").select("*").in("student_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]),
    supabase
      .from("lesson_slot_changes")
      .select("*")
      .or(`on_date.gte.${addDays(from, -60)},new_date.gte.${addDays(from, -60)}`),
  ]);
  const ready = !slotRes.error && !changeRes.error;
  const saved: Slot[] = ready ? (slotRes.data ?? []) : [];
  const withSlot = new Set(saved.map((s) => s.student_id));
  const fallbacks = students
    .filter((s) => !withSlot.has(s.id))
    .map(fallbackSlot)
    .filter((s): s is Slot => !!s);
  return {
    ready,
    slots: [...saved, ...fallbacks],
    changes: ready ? ((changeRes.data ?? []) as SlotChange[]).filter((c) => ids.includes(c.student_id)) : [],
  };
}
