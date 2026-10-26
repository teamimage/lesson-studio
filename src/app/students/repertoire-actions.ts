"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireTeacher } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Constants, type Enums } from "@/lib/supabase/types";

// Lets the teacher correct a piece's status or add a piece to the
// repertoire list without recording a lesson.
export async function setRepertoireStatus(fd: FormData) {
  await requireTeacher();
  const id = String(fd.get("id") ?? "");
  const studentId = String(fd.get("student_id") ?? "");
  const status = String(fd.get("status") ?? "");
  const supabase = await createClient();
  if (status === "remove") {
    await supabase.from("repertoire").delete().eq("id", id);
  } else if ((Constants.public.Enums.repertoire_status as readonly string[]).includes(status)) {
    await supabase.from("repertoire").update({ status: status as Enums<"repertoire_status"> }).eq("id", id);
  }
  revalidatePath(`/students/${studentId}`);
  revalidatePath(`/students/${studentId}/brief`);
  redirect(`/students/${studentId}#repertoire`);
}

export async function addRepertoire(fd: FormData) {
  await requireTeacher();
  const studentId = String(fd.get("student_id") ?? "");
  const title = String(fd.get("title") ?? "").trim();
  const book = String(fd.get("book") ?? "").trim() || null;
  const status = String(fd.get("status") ?? "learning");
  if (!studentId || !title) redirect(`/students/${studentId}`);
  const supabase = await createClient();
  await supabase.from("repertoire").insert({
    student_id: studentId,
    title,
    book,
    status: (Constants.public.Enums.repertoire_status as readonly string[]).includes(status)
      ? (status as Enums<"repertoire_status">)
      : "learning",
    started_on: null,
    last_played_on: null,
  });
  revalidatePath(`/students/${studentId}`);
  redirect(`/students/${studentId}#repertoire`);
}
