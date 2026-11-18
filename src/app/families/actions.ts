"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTeacher } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const ID = /^[0-9a-f-]{36}$/i;

function str(fd: FormData, key: string, max = 200): string {
  return String(fd.get(key) ?? "").trim().slice(0, max);
}

function id(fd: FormData, key: string): string {
  const v = str(fd, key, 40);
  return ID.test(v) ? v : "";
}

function refresh(familyId?: string) {
  revalidatePath("/families");
  if (familyId) revalidatePath(`/families/${familyId}`);
}

/** New family, optionally with students moved into it. */
export async function createFamily(fd: FormData) {
  const { teacher } = await requireTeacher();
  const name = str(fd, "name", 120);
  if (!name) redirect("/families?error=name");
  const supabase = await createClient();
  const { data, error } = await supabase.from("families").insert({ teacher_id: teacher.id, name }).select("id").single();
  if (error || !data) redirect("/families?error=save");
  const studentIds = fd.getAll("student_id").map(String).filter((s) => ID.test(s));
  if (studentIds.length) await supabase.from("students").update({ family_id: data.id }).in("id", studentIds);
  refresh(data.id);
  redirect(`/families/${data.id}`);
}

export async function renameFamily(fd: FormData) {
  await requireTeacher();
  const familyId = id(fd, "family_id");
  const name = str(fd, "name", 120);
  if (familyId && name) {
    const supabase = await createClient();
    await supabase.from("families").update({ name }).eq("id", familyId);
  }
  refresh(familyId);
  redirect(`/families/${familyId}?saved=name`);
}

/** Deletes the family. Its students and guardians stay, without a family; nobody loses access. */
export async function deleteFamily(fd: FormData) {
  await requireTeacher();
  const familyId = id(fd, "family_id");
  if (familyId) {
    const supabase = await createClient();
    // Keep each guardian's current children: no whole-family flag once the family is gone.
    await supabase.from("parents").update({ whole_family: false }).eq("family_id", familyId);
    await supabase.from("families").delete().eq("id", familyId);
  }
  refresh();
  redirect("/families?deleted=1");
}

/** Moves a student into this family (out of any other). Whole-family guardians get access. */
export async function addStudentToFamily(fd: FormData) {
  await requireTeacher();
  const familyId = id(fd, "family_id");
  const studentId = id(fd, "student_id");
  if (familyId && studentId) {
    const supabase = await createClient();
    await supabase.from("students").update({ family_id: familyId }).eq("id", studentId);
  }
  refresh(familyId);
  revalidatePath(`/v3/students/${studentId}/about`);
  redirect(`/families/${familyId}?saved=student`);
}

/** Takes a student out of the family. Whole-family guardians lose access to them. */
export async function removeStudentFromFamily(fd: FormData) {
  await requireTeacher();
  const familyId = id(fd, "family_id");
  const studentId = id(fd, "student_id");
  if (familyId && studentId) {
    const supabase = await createClient();
    await supabase.from("students").update({ family_id: null }).eq("id", studentId).eq("family_id", familyId);
  }
  refresh(familyId);
  revalidatePath(`/v3/students/${studentId}/about`);
  redirect(`/families/${familyId}?saved=removed`);
}

/**
 * Adds or edits a parent or guardian: name, relationship, contact, and which
 * children they see (whole family, or the ones ticked).
 */
export async function saveGuardian(fd: FormData) {
  const { teacher } = await requireTeacher();
  const familyId = id(fd, "family_id");
  const parentId = id(fd, "parent_id");
  const base = `/families/${familyId}/guardians/${parentId || "new"}`;
  const name = str(fd, "name", 120);
  const email = str(fd, "email").toLowerCase();
  if (!familyId) redirect("/families");
  if (!name) redirect(`${base}?error=name`);
  if (email && !email.includes("@")) redirect(`${base}?error=email`);
  const whole = fd.get("access") !== "some";
  const supabase = await createClient();

  const { data: kids } = await supabase.from("students").select("id").eq("family_id", familyId);
  const familyIds = (kids ?? []).map((k) => k.id);
  const chosen = whole ? familyIds : fd.getAll("student_id").map(String).filter((s) => familyIds.includes(s));
  if (!whole && !chosen.length) redirect(`${base}?error=children`);

  const fields = {
    name,
    // Each parent needs a different email in this table. Without one yet, a
    // placeholder (no @, so it never matches a sign-in) is replaced by the
    // email they sign in with when they accept their invite.
    email: email || `none:${crypto.randomUUID()}`,
    relationship: str(fd, "relationship", 60),
    phone: str(fd, "phone", 40) || null,
    supervises_practice: fd.get("supervises_practice") === "on",
    family_id: familyId,
    whole_family: whole,
  };

  let pid = parentId;
  if (pid) {
    const { data: was } = await supabase.from("parents").select("email").eq("id", pid).maybeSingle();
    if (!email && was && !was.email.includes("@")) fields.email = was.email;
    const { error } = await supabase.from("parents").update(fields).eq("id", pid);
    if (error) redirect(`${base}?error=${error.code === "23505" ? "taken" : "save"}`);
  } else {
    const { data, error } = await supabase
      .from("parents")
      .insert({ ...fields, teacher_id: teacher.id })
      .select("id")
      .single();
    if (error || !data) redirect(`${base}?error=${error?.code === "23505" ? "taken" : "save"}`);
    pid = data.id;
  }

  // Links to this family's children follow the choice; links to children in
  // other families are left alone.
  const drop = familyIds.filter((s) => !chosen.includes(s));
  if (drop.length) await supabase.from("student_parents").delete().eq("parent_id", pid).in("student_id", drop);
  if (chosen.length) {
    await supabase
      .from("student_parents")
      .upsert(chosen.map((s) => ({ student_id: s, parent_id: pid })), { ignoreDuplicates: true });
  }
  refresh(familyId);
  for (const s of familyIds) revalidatePath(`/v3/students/${s}/about`);
  redirect(`/families/${familyId}/guardians/${pid}?saved=1`);
}

/** Removes a parent or guardian: they lose access to every child, and their invites stop working. */
export async function removeGuardian(fd: FormData) {
  await requireTeacher();
  const familyId = id(fd, "family_id");
  const parentId = id(fd, "parent_id");
  if (parentId) {
    const supabase = await createClient();
    await supabase.from("parents").delete().eq("id", parentId);
  }
  refresh(familyId);
  redirect(`/families/${familyId}?saved=guardian-removed`);
}

/** Makes an invite link for one parent or guardian. Any older open link for them stops working. */
export async function inviteGuardian(fd: FormData) {
  const { teacher } = await requireTeacher();
  const familyId = id(fd, "family_id");
  const parentId = id(fd, "parent_id");
  const base = `/families/${familyId}/guardians/${parentId}`;
  const supabase = await createClient();
  const [{ data: parent }, { data: links }] = await Promise.all([
    supabase.from("parents").select("id, name, email, user_id").eq("id", parentId).maybeSingle(),
    supabase.from("student_parents").select("student_id").eq("parent_id", parentId),
  ]);
  if (!parent) redirect(`/families/${familyId}`);
  const studentId = links?.[0]?.student_id;
  if (!studentId) redirect(`${base}?error=children`);
  await supabase
    .from("family_invites")
    .update({ status: "revoked", revoked_at: new Date().toISOString() })
    .eq("parent_id", parentId)
    .eq("status", "pending");
  const { error } = await supabase
    .from("family_invites")
    .insert({ teacher_id: teacher.id, student_id: studentId, parent_id: parentId, name: parent.name, email: parent.email });
  if (error) redirect(`${base}?error=invite`);
  refresh(familyId);
  redirect(`${base}?invite=new#invite`);
}

/** Cancels a guardian's open invite link. Access they already have stays. */
export async function cancelGuardianInvite(fd: FormData) {
  await requireTeacher();
  const familyId = id(fd, "family_id");
  const parentId = id(fd, "parent_id");
  const supabase = await createClient();
  await supabase
    .from("family_invites")
    .update({ status: "revoked", revoked_at: new Date().toISOString() })
    .eq("parent_id", parentId)
    .eq("status", "pending");
  refresh(familyId);
  redirect(`/families/${familyId}/guardians/${parentId}?invite=cancelled#invite`);
}
