"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { todayISO } from "@/lib/format";
import { checkPracticePinFor, pinMessage } from "@/lib/practice-pin";

// Saves one day of practice for a student. Works for a parent or the teacher;
// row-level security decides who may write.
export async function savePractice(fd: FormData) {
  const viewer = await getViewer();
  const supabase = await createClient();
  const studentId = String(fd.get("student_id") ?? "");
  const date = String(fd.get("practice_date") ?? "");
  if (!studentId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) redirect("/family");

  const minutesRaw = String(fd.get("minutes") ?? "").trim();
  const minutes = minutesRaw ? Math.max(0, Math.min(600, Number(minutesRaw))) : null;
  const completed = fd.getAll("done").map(String).filter(Boolean);
  const note = String(fd.get("parent_note") ?? "").trim();

  const { error } = await supabase.from("practice_logs").upsert(
    {
      student_id: studentId,
      practice_date: date,
      minutes: Number.isFinite(minutes) ? minutes : null,
      listened: fd.get("listened") === "on",
      completed_assignment_ids: completed,
      parent_note: note || null,
      logged_by: viewer.userId,
    },
    { onConflict: "student_id,practice_date" },
  );

  revalidatePath("/");
  revalidatePath("/family");
  revalidatePath(`/family/${studentId}`);
  revalidatePath(`/students/${studentId}`);
  revalidatePath(`/students/${studentId}/brief`);
  revalidatePath(`/v3/family/${studentId}`);
  // Version 3 Family mode saves from its own practice page and goes back there.
  const v3Practice = `/v3/family/${studentId}/practice`;
  const back = String(fd.get("return_to") ?? "") === v3Practice ? v3Practice : `/family/${studentId}`;
  redirect(`${back}?date=${date}${error ? "&error=save" : "&saved=1"}`);
}

// One day's practice log, for switching days on Home practice without
// reloading the page. Row-level security decides what the viewer may read.
export async function loadPracticeLog(studentId: string, date: string) {
  if (!studentId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("practice_logs")
    .select("practice_date, minutes, listened, completed_assignment_ids, parent_note, listen_plays")
    .eq("student_id", studentId)
    .eq("practice_date", date)
    .maybeSingle();
  return data;
}

/**
 * The practice day page: the family or the teacher changes what was done
 * that day after the fact (ticks off work the recording missed because it
 * started late, fixes the minutes, the listening and the note). Only the
 * fields given are changed; the listening plays stay. Row-level security
 * decides who may write.
 */
export async function savePracticeDay(input: {
  studentId: string;
  date: string;
  done: string[];
  minutes: number | null;
  listened: boolean;
  note: string;
  /** The parent PIN, when one is set. */
  pin?: string;
  /** Opened from Family mode on the teacher's account: the PIN applies there too. */
  familyMode?: boolean;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { studentId, date } = input;
  if (!studentId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: "That day couldn't be found." };
  if (date > todayISO()) return { ok: false, error: "That day hasn't happened yet." };
  const viewer = await getViewer();
  const supabase = await createClient();
  const { data: owner } = await supabase.from("students").select("teacher_id").eq("id", studentId).maybeSingle();
  const isTeacher = !!viewer.teacher && viewer.teacher.id === owner?.teacher_id;
  if (!isTeacher || input.familyMode) {
    const r = await checkPracticePinFor(studentId, input.pin ?? "", supabase);
    if (r !== "ok") return { ok: false, error: pinMessage(r) };
  }
  const minutes =
    input.minutes == null || !Number.isFinite(input.minutes) ? null : Math.max(0, Math.min(600, Math.round(input.minutes)));
  const { data: existing } = await supabase
    .from("practice_logs")
    .select("id, logged_by")
    .eq("student_id", studentId)
    .eq("practice_date", date)
    .maybeSingle();
  const { error } = await supabase.from("practice_logs").upsert(
    {
      student_id: studentId,
      practice_date: date,
      minutes,
      listened: input.listened,
      completed_assignment_ids: [...new Set(input.done.filter(Boolean))],
      parent_note: input.note.trim() || null,
      logged_by: existing?.logged_by ?? viewer.userId,
    },
    { onConflict: "student_id,practice_date" },
  );
  if (error) return { ok: false, error: "Couldn't save that. Try again." };
  revalidatePath("/");
  revalidatePath("/family");
  revalidatePath(`/family/${studentId}`);
  revalidatePath(`/students/${studentId}`);
  revalidatePath(`/v3/students/${studentId}`);
  revalidatePath(`/v3/students/${studentId}/practice/${date}`);
  revalidatePath(`/v3/family/${studentId}`);
  revalidatePath(`/v3/family/${studentId}/practice`);
  return { ok: true };
}
