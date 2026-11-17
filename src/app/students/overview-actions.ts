"use server";

import { revalidatePath } from "next/cache";
import { requireTeacher } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { looseDb } from "@/lib/overview/data";
import { sendEmail, sendText, type SendResult } from "@/lib/overview/send";
import type { Channel } from "@/lib/overview/types";

// The teacher's side of the student overview box: years playing, balance,
// contact details, and messages (email, text, push) that are kept as a record.

export type OverviewState = { error?: string; ok?: string } | null;

const clean = (v: FormDataEntryValue | null, max = 240) => String(v ?? "").trim().slice(0, max);

function refresh(studentId: string) {
  revalidatePath(`/v3/students/${studentId}`);
  revalidatePath(`/students/${studentId}`);
}

/** Loads the student only if it's this teacher's. */
async function ownStudent(studentId: string) {
  const { teacher, email } = await requireTeacher();
  const db = looseDb(await createClient());
  const { data } = await db.from("students").select("id, name, teacher_id").eq("id", studentId).maybeSingle();
  const student = data as { id: string; name: string; teacher_id: string } | null;
  if (!student || student.teacher_id !== teacher.id) return null;
  return { db, teacher, student, viewerEmail: email };
}

const NOT_READY = "Run student-overview.sql in Supabase first, then try again.";

export async function saveYearsPlaying(_: OverviewState, fd: FormData): Promise<OverviewState> {
  const studentId = clean(fd.get("student_id"));
  const own = await ownStudent(studentId);
  if (!own) return { error: "Student not found." };
  const raw = clean(fd.get("years"), 8);
  const year = new Date().getFullYear();
  let since: number | null = null;
  if (raw) {
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0 || n > 90) return { error: "Type a number of years, like 3." };
    since = year - Math.round(n);
  }
  const { error } = await own.db.from("students").update({ playing_since: since }).eq("id", studentId);
  if (error) return { error: NOT_READY };
  refresh(studentId);
  return { ok: "Saved." };
}

/** "120", "$85.50", "-40" (credit). Empty clears it. */
function parseCents(raw: string): number | null | "bad" {
  const t = raw.replace(/[$,\s]/g, "").replace("−", "-");
  if (!t) return null;
  if (!/^-?\d+(\.\d{0,2})?$/.test(t)) return "bad";
  return Math.round(Number(t) * 100);
}

async function upsertPrivate(own: NonNullable<Awaited<ReturnType<typeof ownStudent>>>, fields: Record<string, unknown>) {
  return own.db
    .from("student_private")
    .upsert({ student_id: own.student.id, teacher_id: own.teacher.id, ...fields }, { onConflict: "student_id" });
}

export async function saveBalance(_: OverviewState, fd: FormData): Promise<OverviewState> {
  const studentId = clean(fd.get("student_id"));
  const own = await ownStudent(studentId);
  if (!own) return { error: "Student not found." };
  const cents = parseCents(clean(fd.get("amount"), 20));
  if (cents === "bad") return { error: "Type an amount, like 120 or 85.50. Use a minus sign for a credit." };
  const note = clean(fd.get("note"), 200) || null;
  const { error } = await upsertPrivate(own, {
    balance_cents: cents,
    balance_note: note,
    balance_updated_at: new Date().toISOString(),
  });
  if (error) return { error: NOT_READY };
  refresh(studentId);
  return { ok: "Saved." };
}

const looksLikeEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

async function storeContact(
  own: NonNullable<Awaited<ReturnType<typeof ownStudent>>>,
  key: string,
  fields: { name?: string; email?: string; phone?: string },
): Promise<string | null> {
  if (key === "student") {
    const patch: Record<string, unknown> = {};
    if (fields.email !== undefined) patch.email = fields.email || null;
    if (fields.phone !== undefined) patch.phone = fields.phone || null;
    const { error } = await upsertPrivate(own, patch);
    return error ? NOT_READY : null;
  }
  // A parent of this student.
  const { data: link } = await own.db.from("student_parents").select("parent_id").eq("student_id", own.student.id).eq("parent_id", key).maybeSingle();
  if (!link) return "That parent isn't linked to this student.";
  const patch: Record<string, unknown> = {};
  if (fields.name) patch.name = fields.name;
  if (fields.email) patch.email = fields.email.toLowerCase(); // a parent always keeps an email (it's their sign-in)
  if (fields.phone !== undefined) patch.phone = fields.phone || null;
  if (!Object.keys(patch).length) return null;
  const { error } = await own.db.from("parents").update(patch).eq("id", key);
  return error ? (fields.phone !== undefined ? NOT_READY : "Couldn't save. Try again.") : null;
}

export async function saveContact(_: OverviewState, fd: FormData): Promise<OverviewState> {
  const studentId = clean(fd.get("student_id"));
  const own = await ownStudent(studentId);
  if (!own) return { error: "Student not found." };
  const key = clean(fd.get("contact"));
  const email = clean(fd.get("email"), 200);
  const phone = clean(fd.get("phone"), 40);
  const name = clean(fd.get("name"), 120);
  if (email && !looksLikeEmail(email)) return { error: "That email address doesn't look right." };
  const error = await storeContact(own, key, { email, phone, ...(key !== "student" && name ? { name } : {}) });
  if (error) return { error };
  refresh(studentId);
  return { ok: "Saved." };
}

export async function sendMessage(_: OverviewState, fd: FormData): Promise<OverviewState> {
  const studentId = clean(fd.get("student_id"));
  const own = await ownStudent(studentId);
  if (!own) return { error: "Student not found." };
  const channel = clean(fd.get("channel")) as Channel;
  if (!["email", "text", "push"].includes(channel)) return { error: "Pick email, text or push." };
  const key = clean(fd.get("contact"));
  const recipientName = clean(fd.get("recipient_name"), 120);
  const to = clean(fd.get("to"), 200);
  const subject = clean(fd.get("subject"), 200);
  let body = String(fd.get("body") ?? "").trim().slice(0, 5000);
  if (!body) return { error: "Write a message first." };
  if (channel === "email" && !looksLikeEmail(to)) return { error: "Add an email address." };
  if (channel === "text" && to.replace(/\D/g, "").length < 7) return { error: "Add a phone number." };

  const t = own.teacher as { message_signature?: string | null; message_reply_to?: string | null };
  if (channel !== "push" && t.message_signature?.trim()) body = `${body}\n\n${t.message_signature.trim()}`;

  // Keep a new or changed address for next time.
  if (fd.get("remember") === "on" && channel !== "push") {
    await storeContact(own, key, channel === "email" ? { email: to } : { phone: to });
  }

  let result: SendResult;
  if (channel === "email") result = await sendEmail(to, subject || `A note from ${own.teacher.name || "your teacher"}`, body, t.message_reply_to || own.viewerEmail);
  else if (channel === "text") result = await sendText(to, body);
  else result = { status: "not_sent", error: "Push notifications start when the app is installed on phones." };

  const { error } = await own.db.from("messages").insert({
    teacher_id: own.teacher.id,
    student_id: studentId,
    parent_id: key === "student" ? null : key,
    recipient_name: recipientName || "Unknown",
    recipient_role: key === "student" ? "student" : "parent",
    channel,
    to_address: channel === "push" ? null : to,
    subject: channel === "email" ? subject || null : null,
    body,
    status: result.status,
    error: result.error ?? null,
    provider_id: result.providerId ?? null,
  });
  if (error) {
    return result.status === "sent"
      ? { error: "It was sent, but the copy for the history couldn't be saved. Run student-overview.sql." }
      : { error: NOT_READY };
  }
  refresh(studentId);
  if (result.status === "sent") return { ok: "Sent. It's in the communication history." };
  if (result.status === "failed") return { error: `Not sent: ${result.error} Saved in the history as failed.` };
  return { ok: `Saved in the history, not sent. ${result.error}` };
}

export async function updateMessageSettings(fd: FormData) {
  const { teacher } = await requireTeacher();
  const db = looseDb(await createClient());
  await db
    .from("teachers")
    .update({
      message_signature: clean(fd.get("message_signature"), 300) || null,
      message_reply_to: clean(fd.get("message_reply_to"), 200) || null,
    })
    .eq("id", teacher.id);
  revalidatePath("/settings");
  revalidatePath("/v3/setup");
}
