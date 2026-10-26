"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

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
  redirect(`/family/${studentId}?date=${date}${error ? "&error=save" : "&saved=1"}`);
}
