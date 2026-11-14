"use server";

import { revalidatePath } from "next/cache";
import { getViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PRACTICE_BUCKET } from "@/lib/constants";
import type { Json } from "@/lib/supabase/types";
import { parseActivity, playingSeconds, withTuningChecks } from "@/lib/practice/activity";
import { parseTuningChecks } from "@/lib/practice/tuner";
import { attachRecording, deleteRecording, finishUpload, retry, type PracticeState } from "@/lib/practice/process";
import { getConsentStatus } from "@/lib/recording-consent-data";
import { CONSENT_SETUP_MESSAGE, consentNeededMessage } from "@/lib/recording-consent";

export type NewPracticeInput = {
  studentId: string;
  media: "audio" | "video";
  mimeType: string;
  extension: string;
  sizeBytes: number;
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
  /** The phone's local date, so a late-evening session lands on the right day. */
  practiceDate: string;
  activity: unknown;
  /** Tuner checks done before Start or during the session. */
  tuning?: unknown;
  /** "Practicing with someone else?": a parent or helper was giving instruction. Still a practice, never a lesson. */
  withHelper?: boolean;
};

const SETUP_ERROR = "Practice sessions aren't set up yet. Run practice-sessions.sql in the Supabase SQL Editor.";

function revalidate(studentId: string) {
  revalidatePath(`/family/${studentId}`);
  revalidatePath(`/students/${studentId}`);
  revalidatePath(`/teacher/${studentId}`);
  revalidatePath("/family");
  revalidatePath("/");
}

function isMissingColumn(e: { code?: string; message?: string }): boolean {
  return e.code === "42703" || e.code === "PGRST204" || /with_helper/.test(e.message ?? "");
}

/** Called at Stop: saves the session and says where to upload the recording. */
export async function createPracticeSession(input: NewPracticeInput): Promise<{ id: string; path: string } | { error: string }> {
  const viewer = await getViewer();
  const db = await createClient();
  const { data: student } = await db.from("students").select("id, teacher_id").eq("id", input.studentId).maybeSingle();
  if (!student) return { error: "That student wasn't found." };
  const consent = await getConsentStatus(student.id);
  if (consent.state === "setup") return { error: CONSENT_SETUP_MESSAGE };
  if (consent.state !== "signed") return { error: consentNeededMessage("this student") };

  const { data: plan } = await db
    .from("lessons")
    .select("id")
    .eq("student_id", student.id)
    .eq("status", "approved")
    .order("lesson_date", { ascending: false })
    .order("approved_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const activity = parseActivity(input.activity).slice(0, 4 * 3600);
  const ext = /^[a-z0-9]{2,5}$/.test(input.extension) ? input.extension : "webm";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(input.practiceDate) ? input.practiceDate : undefined;
  const fields = {
    student_id: student.id,
    teacher_id: student.teacher_id,
    lesson_id: plan?.id ?? null,
    ...(date ? { practice_date: date } : {}),
    started_at: input.startedAt,
    ended_at: input.endedAt,
    duration_seconds: Math.max(0, Math.round(input.durationSeconds)),
    playing_seconds: playingSeconds(activity),
    media: input.media === "video" ? "video" : "audio",
    mime_type: input.mimeType.split(";")[0] || null,
    size_bytes: Math.round(input.sizeBytes) || null,
    activity: withTuningChecks(activity, parseTuningChecks(input.tuning)) as unknown as Json,
    created_by: viewer.userId,
  };
  const insert = (withHelper: boolean) =>
    db
      .from("practice_sessions")
      .insert({ ...fields, ...(withHelper ? { with_helper: true } : {}) })
      .select("id")
      .single();
  let { data: row, error } = await insert(!!input.withHelper);
  // practice-with-helper.sql not run yet: still save the practice, without the flag.
  if (error && input.withHelper && isMissingColumn(error)) ({ data: row, error } = await insert(false));
  if (error || !row) return { error: error?.code === "42P01" || error?.code === "PGRST205" ? SETUP_ERROR : "Couldn't save the session." };

  const path = `${student.id}/${row.id}.${ext}`;
  await db.from("practice_sessions").update({ storage_path: path }).eq("id", row.id);
  return { id: row.id, path };
}

/**
 * Called once the recording is uploaded, or with `noRecording` when it
 * couldn't be: the practice is logged and reviewed either way.
 */
export async function finishPracticeUpload(id: string, noRecording = false): Promise<PracticeState> {
  const out = await finishUpload(id, { noRecording });
  const db = await createClient();
  const { data } = await db.from("practice_sessions").select("student_id").eq("id", id).maybeSingle();
  if (data) revalidate(data.student_id);
  return out;
}

/** A recording that failed at Stop uploaded on a later try. */
export async function attachPracticeRecording(id: string, path: string): Promise<PracticeState | null> {
  const out = await attachRecording(id, path);
  const db = await createClient();
  const { data } = await db.from("practice_sessions").select("student_id").eq("id", id).maybeSingle();
  if (data) revalidate(data.student_id);
  return out;
}

export async function retryPracticeReview(id: string): Promise<PracticeState | null> {
  const out = await retry(id);
  const db = await createClient();
  const { data } = await db.from("practice_sessions").select("student_id").eq("id", id).maybeSingle();
  if (data) revalidate(data.student_id);
  return out;
}

/**
 * Removes a session and its recording. Ticks it already added to the
 * practice log stay (they can be unticked by hand).
 */
export async function deletePracticeSession(id: string): Promise<void> {
  const db = await createClient();
  const { data: s } = await db.from("practice_sessions").select("*").eq("id", id).maybeSingle();
  if (!s) return;
  await deleteRecording(db, s);
  if (s.storage_path) await db.storage.from(PRACTICE_BUCKET).remove([s.storage_path]);
  await db.from("practice_sessions").delete().eq("id", id);
  revalidate(s.student_id);
}
