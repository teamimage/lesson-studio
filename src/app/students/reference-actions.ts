"use server";

import { revalidatePath } from "next/cache";
import { getViewer, requireTeacher } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { REFERENCE_RIGHTS_STATEMENT, REFERENCE_RIGHTS_VERSION } from "@/lib/reference-rights";
import { REFERENCE_BUCKET, audioMimeFor, extensionOf, isHttpUrl, parsePlays } from "@/lib/reference-recordings";
import type { RightsConfirmation } from "@/lib/music-rights";

const SETUP =
  "Reference recordings aren't set up yet. Run reference-recordings.sql in the Supabase SQL Editor, then try again.";
const RIGHTS_NEEDED = "Tick the box to confirm you own this recording.";

function rightsOk(r: RightsConfirmation | undefined): boolean {
  return !!r && r.confirmed === true && r.version === REFERENCE_RIGHTS_VERSION;
}

function clean(s: unknown, max = 200): string {
  return typeof s === "string" ? s.trim().slice(0, max) : "";
}

function trackNo(v: unknown): number | null {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 && n < 1000 ? n : null;
}

function revalidateLibrary(studentId?: string) {
  revalidatePath("/listening");
  if (studentId) revalidatePath(`/students/${studentId}/music`);
}

async function recordRights(fileNames: string[]): Promise<{ id: string; at: string; email: string } | { error: string }> {
  const { teacher, userId, email } = await requireTeacher();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reference_rights_confirmations")
    .insert({
      teacher_id: teacher.id,
      confirmed_by: userId,
      confirmed_email: email,
      statement_version: REFERENCE_RIGHTS_VERSION,
      statement: REFERENCE_RIGHTS_STATEMENT,
      file_names: fileNames.map((n) => String(n).slice(0, 200)).slice(0, 300),
    })
    .select("id, confirmed_at")
    .single();
  if (error || !data) return { error: SETUP };
  return { id: data.id, at: data.confirmed_at, email };
}

export type NewTrack = {
  fileName: string;
  size: number;
  type: string;
  title: string;
  trackNo: number | null;
  durationSeconds: number | null;
};

export type StartedTrack = { id: string; path: string; contentType: string };

/**
 * Records the sign-off and makes a row per file (status "uploading"). The
 * browser then uploads each file to `path` and calls finishReferenceUpload.
 */
export async function startReferenceUpload(input: {
  instrument: string;
  book: string;
  scoreId: string | null;
  tracks: NewTrack[];
  rights: RightsConfirmation;
  studentId?: string;
}): Promise<{ tracks: StartedTrack[] } | { error: string }> {
  if (!rightsOk(input.rights)) return { error: RIGHTS_NEEDED };
  const tracks = (input.tracks ?? []).slice(0, 200);
  if (!tracks.length) return { error: "Choose one or more audio files." };
  const { teacher } = await requireTeacher();
  const rights = await recordRights(tracks.map((t) => t.fileName));
  if ("error" in rights) return rights;

  const supabase = await createClient();
  const rows = tracks.map((t) => {
    const id = crypto.randomUUID();
    const ext = extensionOf(t.fileName) || "mp3";
    return {
      id,
      teacher_id: teacher.id,
      instrument: clean(input.instrument, 40) || null,
      book: clean(input.book) || null,
      score_id: input.scoreId || null,
      track_no: trackNo(t.trackNo),
      title: clean(t.title) || clean(t.fileName) || "Recording",
      source: "file",
      status: "uploading",
      storage_path: `${teacher.id}/${id}/audio.${ext}`,
      file_name: clean(t.fileName),
      size_bytes: Number.isFinite(t.size) ? Math.round(t.size) : null,
      mime_type: audioMimeFor(t.fileName, String(t.type ?? "")),
      duration_seconds: t.durationSeconds && Number.isFinite(t.durationSeconds) ? Math.round(t.durationSeconds) : null,
      rights_confirmation_id: rights.id,
      rights_confirmed_at: rights.at,
      rights_confirmed_email: rights.email,
      rights_version: REFERENCE_RIGHTS_VERSION,
    };
  });
  const { error } = await supabase.from("reference_recordings").insert(rows);
  if (error) return { error: SETUP };
  revalidateLibrary(input.studentId);
  return { tracks: rows.map((r) => ({ id: r.id, path: r.storage_path, contentType: r.mime_type })) };
}

/** Marks one file as uploaded, or removes its row when the upload failed. */
export async function finishReferenceUpload(id: string, ok: boolean, studentId?: string): Promise<void> {
  await requireTeacher();
  const supabase = await createClient();
  if (ok) await supabase.from("reference_recordings").update({ status: "ready" }).eq("id", id);
  else await deleteRow(id);
  revalidateLibrary(studentId);
}

/** A recording that lives elsewhere (a streaming page, a shared drive). */
export async function addReferenceLink(fd: FormData): Promise<{ error?: string }> {
  if (fd.get("rights") !== "on") return { error: RIGHTS_NEEDED };
  const url = clean(fd.get("url"), 1000);
  if (!isHttpUrl(url)) return { error: "Paste a full link, starting with https://" };
  const title = clean(fd.get("title"));
  if (!title) return { error: "Give the recording a name." };
  const { teacher } = await requireTeacher();
  const rights = await recordRights([url]);
  if ("error" in rights) return rights;
  const supabase = await createClient();
  const { error } = await supabase.from("reference_recordings").insert({
    teacher_id: teacher.id,
    instrument: clean(fd.get("instrument"), 40) || null,
    book: clean(fd.get("book")) || null,
    track_no: trackNo(fd.get("track_no")),
    title,
    source: "link",
    status: "ready",
    link_url: url,
    rights_confirmation_id: rights.id,
    rights_confirmed_at: rights.at,
    rights_confirmed_email: rights.email,
    rights_version: REFERENCE_RIGHTS_VERSION,
  });
  if (error) return { error: SETUP };
  revalidateLibrary(clean(fd.get("student_id"), 40) || undefined);
  return {};
}

/** Renames or re-tags a recording. */
export async function updateReference(fd: FormData): Promise<void> {
  await requireTeacher();
  const id = clean(fd.get("id"), 40);
  const title = clean(fd.get("title"));
  if (!id || !title) return;
  const supabase = await createClient();
  await supabase
    .from("reference_recordings")
    .update({
      title,
      book: clean(fd.get("book")) || null,
      track_no: trackNo(fd.get("track_no")),
    })
    .eq("id", id);
  revalidateLibrary(clean(fd.get("student_id"), 40) || undefined);
}

async function deleteRow(id: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("reference_recordings").select("storage_path").eq("id", id).maybeSingle();
  if (data?.storage_path) await supabase.storage.from(REFERENCE_BUCKET).remove([data.storage_path]);
  await supabase.from("reference_recordings").delete().eq("id", id);
}

/** Deletes a recording and its file. Practice items that pointed at it keep their wording. */
export async function deleteReference(fd: FormData): Promise<void> {
  await requireTeacher();
  const id = clean(fd.get("id"), 40);
  if (id) await deleteRow(id);
  revalidateLibrary(clean(fd.get("student_id"), 40) || undefined);
}

/**
 * One play-through of an assigned recording on a practice day. Ticks the
 * item off once it has been played as many times as the teacher asked, and
 * marks the day as "listened". Works for a parent or the teacher (row-level
 * security decides).
 */
export async function recordListen(input: {
  studentId: string;
  date: string;
  assignmentId: string;
}): Promise<{ plays: number; done: boolean } | { error: string }> {
  const viewer = await getViewer();
  const { studentId, date, assignmentId } = input;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Bad date." };
  const supabase = await createClient();
  const { data: a } = await supabase
    .from("assignments")
    .select("id, listen_times")
    .eq("id", assignmentId)
    .eq("student_id", studentId)
    .maybeSingle();
  if (!a) return { error: "That practice item wasn't found." };
  const { data: log, error: readError } = await supabase
    .from("practice_logs")
    .select("*")
    .eq("student_id", studentId)
    .eq("practice_date", date)
    .maybeSingle();
  if (readError) return { error: "Couldn't save the play." };

  const plays = parsePlays(log?.listen_plays);
  plays[assignmentId] = (plays[assignmentId] ?? 0) + 1;
  const done = plays[assignmentId] >= Math.max(1, a.listen_times ?? 1);
  const completed = new Set(log?.completed_assignment_ids ?? []);
  if (done) completed.add(assignmentId);

  const { error } = await supabase.from("practice_logs").upsert(
    {
      student_id: studentId,
      practice_date: date,
      listened: true,
      completed_assignment_ids: [...completed],
      listen_plays: plays,
      logged_by: log?.logged_by ?? viewer.userId,
    },
    { onConflict: "student_id,practice_date" },
  );
  if (error) return { error: "Couldn't save the play. Has reference-recordings.sql been run?" };
  revalidatePath(`/family/${studentId}`);
  revalidatePath(`/students/${studentId}`);
  revalidatePath("/family");
  return { plays: plays[assignmentId], done };
}
