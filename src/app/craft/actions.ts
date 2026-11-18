"use server";

import { revalidatePath } from "next/cache";
import { requireTeacher } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { todayISO } from "@/lib/format";
import { programBySlug } from "@/lib/craft/content";

function refresh() {
  revalidatePath("/downbeat");
}

/** Start a Focus program. Any running one is ended first. */
export async function startProgram(formData: FormData) {
  const slug = String(formData.get("program") ?? "");
  if (!programBySlug(slug)) return;
  const { teacher } = await requireTeacher();
  const supabase = await createClient();
  const today = todayISO();
  await supabase.from("craft_runs").update({ ended_on: today }).eq("teacher_id", teacher.id).is("ended_on", null);
  await supabase.from("craft_runs").insert({ teacher_id: teacher.id, program: slug, started_on: today, length_days: 7 });
  refresh();
}

/** One tap: did you try today's habit? Tapping the same answer clears it. */
export async function checkIn(runId: string, day: number, answer: "yes" | "partly" | "no" | null): Promise<boolean> {
  if (!Number.isInteger(day) || day < 1 || day > 63) return false;
  if (answer !== null && !["yes", "partly", "no"].includes(answer)) return false;
  await requireTeacher();
  const supabase = await createClient();
  const { error } = answer
    ? await supabase.from("craft_checkins").upsert({ run_id: runId, day, answer }, { onConflict: "run_id,day" })
    : await supabase.from("craft_checkins").delete().eq("run_id", runId).eq("day", day);
  return !error;
}

/** Seven more days on the same program, for more recorded lessons. */
export async function keepGoing(formData: FormData) {
  const runId = String(formData.get("run") ?? "");
  const { teacher } = await requireTeacher();
  const supabase = await createClient();
  const { data } = await supabase
    .from("craft_runs")
    .select("length_days, started_on")
    .eq("id", runId)
    .eq("teacher_id", teacher.id)
    .maybeSingle();
  if (!data) return;
  await supabase
    .from("craft_runs")
    .update({ length_days: Math.min(63, data.length_days + 7) })
    .eq("id", runId)
    .eq("teacher_id", teacher.id);
  refresh();
}

export async function endProgram(formData: FormData) {
  const runId = String(formData.get("run") ?? "");
  const { teacher } = await requireTeacher();
  const supabase = await createClient();
  await supabase.from("craft_runs").update({ ended_on: todayISO() }).eq("id", runId).eq("teacher_id", teacher.id);
  refresh();
}
