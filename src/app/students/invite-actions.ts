"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTeacher } from "@/lib/auth";
import { getStudent } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";

const back = (studentId: string, q: string) => `/students/${studentId}?open=parents&${q}#family-access`;

/** Makes a new invite link for the student's family. */
export async function createFamilyInvite(fd: FormData) {
  const { teacher } = await requireTeacher();
  const studentId = String(fd.get("student_id") ?? "");
  const student = await getStudent(studentId);
  if (!student || student.teacher_id !== teacher.id) redirect("/");
  const name = String(fd.get("name") ?? "").trim().slice(0, 120);
  const email = String(fd.get("email") ?? "").trim().toLowerCase().slice(0, 200);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("family_invites")
    .insert({ teacher_id: teacher.id, student_id: studentId, name, email })
    .select("id")
    .single();
  revalidatePath(`/students/${studentId}`);
  if (error || !data) {
    redirect(back(studentId, `invite=${error?.code === "42P01" || error?.code === "PGRST205" ? "setup" : "error"}`));
  }
  redirect(back(studentId, `invite=new&made=${data.id}`));
}

/**
 * Cancels an invite. If it was already used, also takes away the access it
 * gave (that parent is unlinked from this student; their other children stay).
 */
export async function revokeFamilyInvite(fd: FormData) {
  await requireTeacher();
  const studentId = String(fd.get("student_id") ?? "");
  const inviteId = String(fd.get("invite_id") ?? "");
  const supabase = await createClient();
  const { data: invite } = await supabase
    .from("family_invites")
    .select("id, accepted_parent_id")
    .eq("id", inviteId)
    .eq("student_id", studentId)
    .maybeSingle();
  if (invite) {
    await supabase
      .from("family_invites")
      .update({ status: "revoked", revoked_at: new Date().toISOString() })
      .eq("id", invite.id);
    if (invite.accepted_parent_id) {
      await supabase
        .from("student_parents")
        .delete()
        .eq("student_id", studentId)
        .eq("parent_id", invite.accepted_parent_id);
    }
  }
  revalidatePath(`/students/${studentId}`);
  revalidatePath(`/family/${studentId}`);
  redirect(back(studentId, "invite=revoked"));
}

/** Removes a linked family account's access to this student. */
export async function removeFamilyAccess(fd: FormData) {
  await requireTeacher();
  const studentId = String(fd.get("student_id") ?? "");
  const parentId = String(fd.get("parent_id") ?? "");
  const supabase = await createClient();
  await supabase.from("student_parents").delete().eq("student_id", studentId).eq("parent_id", parentId);
  await supabase
    .from("family_invites")
    .update({ status: "revoked", revoked_at: new Date().toISOString() })
    .eq("student_id", studentId)
    .eq("accepted_parent_id", parentId);
  revalidatePath(`/students/${studentId}`);
  revalidatePath(`/family/${studentId}`);
  redirect(back(studentId, "invite=removed"));
}
