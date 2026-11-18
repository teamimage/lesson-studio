"use server";

import { revalidatePath } from "next/cache";
import { getViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { mergeSessions, splitSession } from "@/lib/practice/merge";
import { checkPracticePinFor, pinMessage } from "@/lib/practice-pin";

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
