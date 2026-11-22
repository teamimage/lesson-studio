"use server";

import { revalidatePath } from "next/cache";
import { getViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { mergeSessions, splitSession } from "@/lib/practice/merge";
import { checkPracticePinFor, pinMessage } from "@/lib/practice-pin";
import { unapplyFromLog } from "@/lib/practice/process";
import { PRACTICE_BUCKET } from "@/lib/constants";
import { deleteStream } from "@/lib/stream";

type Result = { ok: true } | { ok: false; error: string };

/** The parent PIN guards joining and splitting the same way it guards editing a practice day. */
async function pinOk(studentId: string, pin: string, familyMode: boolean): Promise<string | null> {
  const viewer = await getViewer();
  const db = await createClient();
  const { data: owner } = await db.from("students").select("teacher_id").eq("id", studentId).maybeSingle();
  if (!owner) return "That student couldn't be found.";
  const isTeacher = !!viewer.teacher && viewer.teacher.id === owner.teacher_id;
  if (isTeacher && !familyMode) return null;
  const r = await checkPracticePinFor(studentId, pin, db);
  return r === "ok" ? null : pinMessage(r);
}

function refresh(studentId: string, date: string) {
  revalidatePath("/");
  revalidatePath(`/family/${studentId}`);
  revalidatePath(`/v3/students/${studentId}`);
  revalidatePath(`/v3/students/${studentId}/practice/${date}`);
  revalidatePath(`/v3/family/${studentId}`);
}

/** Joins the chosen recordings of one day into one practice and reviews it again. */
export async function joinPracticeSessions(input: {
  studentId: string;
  date: string;
  ids: string[];
  pin?: string;
  familyMode?: boolean;
}): Promise<Result> {
  const blocked = await pinOk(input.studentId, input.pin ?? "", !!input.familyMode);
  if (blocked) return { ok: false, error: blocked };
  const r = await mergeSessions(input.ids);
  refresh(input.studentId, input.date);
  return r.ok ? { ok: true } : r;
}

/** Undoes a join: the original recordings and their reviews come back. */
export async function splitPracticeSession(input: {
  studentId: string;
  date: string;
  id: string;
  pin?: string;
  familyMode?: boolean;
}): Promise<Result> {
  const blocked = await pinOk(input.studentId, input.pin ?? "", !!input.familyMode);
  if (blocked) return { ok: false, error: blocked };
  const r = await splitSession(input.id);
  refresh(input.studentId, input.date);
  return r.ok ? { ok: true } : r;
}

/** Deletes one practice recording: its minutes and ticks come off the day's log first. */
export async function deleteDayPractice(input: {
  studentId: string;
  date: string;
  id: string;
  pin?: string;
  familyMode?: boolean;
}): Promise<Result> {
  const blocked = await pinOk(input.studentId, input.pin ?? "", !!input.familyMode);
  if (blocked) return { ok: false, error: blocked };
  const db = await createClient();
  const { data: s } = await db.from("practice_sessions").select("*").eq("id", input.id).maybeSingle();
  if (!s || s.student_id !== input.studentId) return { ok: false, error: "That practice wasn't found." };
  await unapplyFromLog(db, s);
  if (s.storage_path) await db.storage.from(PRACTICE_BUCKET).remove([s.storage_path]);
  const { error } = await db.from("practice_sessions").delete().eq("id", s.id);
  refresh(input.studentId, input.date);
  return error ? { ok: false, error: "Couldn't delete that practice." } : { ok: true };
}

/** Deletes a lesson from the calendar (teacher only), with its streaming copies. */
export async function deleteDayLesson(input: { studentId: string; date: string; lessonId: string }): Promise<Result> {
  const viewer = await getViewer();
  if (!viewer.teacher) return { ok: false, error: "Only the teacher can delete a lesson." };
  const db = await createClient();
  const { data: recs } = await db.from("recordings").select("stream_uid").eq("lesson_id", input.lessonId);
  await Promise.all((recs ?? []).flatMap((r) => (r.stream_uid ? [deleteStream(r.stream_uid).catch(() => {})] : [])));
  const { error } = await db.from("lessons").delete().eq("id", input.lessonId);
  refresh(input.studentId, input.date);
  revalidatePath("/", "layout");
  return error ? { ok: false, error: "Couldn't delete that lesson." } : { ok: true };
}
