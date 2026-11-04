import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/types";

// Standing technique and posture reminders for a student (bow hold, sitting
// tall...). They stay on Home practice and the lesson sheet from lesson to
// lesson until the teacher clears them. Table: student_reminders
// (admin/student-reminders.sql).

export type Reminder = Tables<"student_reminders">;
export type ReminderKind = "technique" | "posture";
export const REMINDER_KINDS: ReminderKind[] = ["posture", "technique"];

export type StudentReminders = {
  active: Reminder[];
  suggested: Reminder[];
  /** False until student-reminders.sql has been run. */
  ready: boolean;
};

const EMPTY: StudentReminders = { active: [], suggested: [], ready: false };

/** Posture first, then technique, each in the teacher's order. */
export function sortReminders(list: Reminder[]): Reminder[] {
  const rank = (k: string) => (k === "posture" ? 0 : 1);
  return [...list].sort(
    (a, b) => rank(a.kind) - rank(b.kind) || a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at),
  );
}

export async function listReminders(studentId: string): Promise<StudentReminders> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("student_reminders")
    .select("*")
    .eq("student_id", studentId)
    .in("status", ["active", "suggested"]);
  if (error) return EMPTY;
  const rows = data ?? [];
  return {
    active: sortReminders(rows.filter((r) => r.status === "active")),
    suggested: sortReminders(rows.filter((r) => r.status === "suggested")),
    ready: true,
  };
}

/** Only what the family sees. */
export async function listActiveReminders(studentId: string): Promise<Reminder[]> {
  return (await listReminders(studentId)).active;
}

export function kindLabel(kind: string): string {
  return kind === "posture" ? "Posture" : "Technique";
}
