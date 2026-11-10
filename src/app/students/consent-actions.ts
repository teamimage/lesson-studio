"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getStudent, getTeacherForStudent } from "@/lib/data";
import { CONSENT_VERSION, consentStatement, isRelationship } from "@/lib/recording-consent";

// A drawn signature, saved as a small PNG. Anything bigger than this is not
// from our signature pad.
const MAX_SIGNATURE_CHARS = 400_000;
const PNG_PREFIX = "data:image/png;base64,";

/** Only same-site paths for the page to go back to after signing. */
function safeNext(next: string, studentId: string): string {
  return /^\/[A-Za-z0-9/_\-?=&#.]*$/.test(next) && !next.startsWith("//") ? next : `/students/${studentId}`;
}

/** Adds consent=signed to a path, before any #fragment. */
function withSignedFlag(path: string): string {
  const [base, hash] = path.split("#");
  return `${base}${base.includes("?") ? "&" : "?"}consent=signed${hash ? `#${hash}` : ""}`;
}

function revalidateStudent(studentId: string) {
  revalidatePath(`/students/${studentId}`);
  revalidatePath(`/students/${studentId}/consent`);
  revalidatePath(`/family/${studentId}`);
  revalidatePath(`/teacher/${studentId}`);
  revalidatePath("/");
}

/**
 * Saves a parent's or guardian's signed consent: collected on the teacher's
 * device, or signed by the family on their own account.
 */
export async function signConsent(fd: FormData) {
  const viewer = await getViewer();
  const studentId = String(fd.get("student_id") ?? "");
  const next = String(fd.get("next") ?? "");
  const back = `/students/${studentId}/consent${next ? `?next=${encodeURIComponent(next)}&` : "?"}`;

  const student = await getStudent(studentId);
  if (!student) redirect("/");

  const agreed = fd.get("agree") === "on";
  const signerName = String(fd.get("signer_name") ?? "").trim().slice(0, 120);
  const relationship = String(fd.get("relationship") ?? "");
  const signerEmail = String(fd.get("signer_email") ?? "").trim().slice(0, 200);
  const signature = String(fd.get("signature") ?? "");
  const version = String(fd.get("version") ?? "");

  if (version !== CONSENT_VERSION) redirect(`${back}error=version`);
  if (!agreed) redirect(`${back}error=agree`);
  if (signerName.length < 2) redirect(`${back}error=name`);
  if (!isRelationship(relationship)) redirect(`${back}error=relationship`);
  if (!signature.startsWith(PNG_PREFIX) || signature.length < 200 || signature.length > MAX_SIGNATURE_CHARS) {
    redirect(`${back}error=signature`);
  }

  const isTeacher = !!viewer.teacher && viewer.teacher.id === student.teacher_id;
  const teacher = isTeacher ? viewer.teacher : await getTeacherForStudent(student);
  const teacherName = teacher?.name || teacher?.studio_name || "";
  const supabase = await createClient();
  const { error } = await supabase.from("recording_consents").insert({
    teacher_id: student.teacher_id,
    student_id: student.id,
    student_name: student.name,
    signer_name: signerName,
    signer_relationship: relationship,
    signer_email: signerEmail,
    signature_png: signature,
    collected_by: viewer.userId,
    collected_email: viewer.email,
    collected_how: isTeacher ? "teacher_device" : "parent_account",
    statement_version: CONSENT_VERSION,
    statement: consentStatement(student.name, teacherName),
  });
  if (error) {
    redirect(`${back}error=${error.code === "42P01" || error.code === "PGRST205" ? "setup" : "save"}`);
  }

  revalidateStudent(student.id);
  redirect(next ? withSignedFlag(safeNext(next, student.id)) : `/students/${student.id}/consent?signed=1`);
}

/** Withdraws consent. The record is kept, stamped with who withdrew it and when. */
export async function withdrawConsent(fd: FormData) {
  const viewer = await getViewer();
  const studentId = String(fd.get("student_id") ?? "");
  const consentId = String(fd.get("consent_id") ?? "");
  const reason = String(fd.get("reason") ?? "").trim().slice(0, 500);
  const supabase = await createClient();
  const { error } = await supabase
    .from("recording_consents")
    .update({
      revoked_at: new Date().toISOString(),
      revoked_by: viewer.userId,
      revoked_email: viewer.email,
      revoked_reason: reason || null,
    })
    .eq("id", consentId)
    .eq("student_id", studentId)
    .is("revoked_at", null);
  revalidateStudent(studentId);
  redirect(`/students/${studentId}/consent?${error ? "error=withdraw" : "withdrawn=1"}`);
}
