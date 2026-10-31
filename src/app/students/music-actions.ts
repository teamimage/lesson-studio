"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireTeacher } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SCORES_BUCKET, SCORE_KINDS } from "@/lib/constants";
import { findOrCreateTodayLesson } from "@/lib/lesson-today";
import { parsePages, type ScorePage } from "@/lib/stand-timeline";

export type StartScoreResult = { id: string; prefix: string } | { error: string };

/** Creates the score row; the browser then uploads page images under `prefix`. */
export async function startScore(input: { studentId: string; title: string; kind: string }): Promise<StartScoreResult> {
  const { teacher } = await requireTeacher();
  const supabase = await createClient();
  const title = String(input.title ?? "").trim().slice(0, 120);
  if (!title) return { error: "Give the music a name first." };
  const kind = SCORE_KINDS.some((k) => k.value === input.kind) ? input.kind : "piece";

  const { data: student } = await supabase.from("students").select("id").eq("id", input.studentId).maybeSingle();
  if (!student) return { error: "That student wasn't found." };

  // Link to the repertoire entry with the same name, if there is one.
  const { data: rep } = await supabase
    .from("repertoire")
    .select("id")
    .eq("student_id", student.id)
    .ilike("title", title.replace(/[%_]/g, ""))
    .limit(1)
    .maybeSingle();
  const { count } = await supabase.from("scores").select("id", { count: "exact", head: true }).eq("student_id", student.id);

  const id = crypto.randomUUID();
  const { error } = await supabase.from("scores").insert({
    id,
    teacher_id: teacher.id,
    student_id: student.id,
    repertoire_id: rep?.id ?? null,
    title,
    kind,
    sort_order: count ?? 0,
  });
  if (error) return { error: "Couldn't save that. Try again." };
  return { id, prefix: `${teacher.id}/${student.id}/${id}/` };
}

/** Saves the uploaded page list once every page image is in storage. */
export async function finishScore(id: string, pages: ScorePage[]): Promise<{ ok: boolean }> {
  const { teacher } = await requireTeacher();
  const supabase = await createClient();
  const { data: score } = await supabase.from("scores").select("id, student_id").eq("id", id).maybeSingle();
  if (!score) return { ok: false };
  const prefix = `${teacher.id}/${score.student_id}/${id}/`;
  const clean = parsePages(pages).filter((p) => p.path.startsWith(prefix));
  if (clean.length === 0) return { ok: false };
  const { error } = await supabase.from("scores").update({ pages: clean }).eq("id", id);
  revalidatePath(`/students/${score.student_id}/music`);
  return { ok: !error };
}

export async function renameScore(fd: FormData) {
  await requireTeacher();
  const id = String(fd.get("score_id") ?? "");
  const title = String(fd.get("title") ?? "").trim().slice(0, 120);
  if (!title) return;
  const supabase = await createClient();
  const { data } = await supabase.from("scores").update({ title }).eq("id", id).select("student_id").maybeSingle();
  if (data) revalidatePath(`/students/${data.student_id}/music`);
}

export async function setScoreArchived(fd: FormData) {
  await requireTeacher();
  const id = String(fd.get("score_id") ?? "");
  const archived = fd.get("archived") === "1";
  const supabase = await createClient();
  const { data } = await supabase.from("scores").update({ archived }).eq("id", id).select("student_id").maybeSingle();
  if (data) revalidatePath(`/students/${data.student_id}/music`);
}

export async function moveScore(fd: FormData) {
  await requireTeacher();
  const id = String(fd.get("score_id") ?? "");
  const dir = fd.get("dir") === "up" ? -1 : 1;
  const supabase = await createClient();
  const { data: score } = await supabase.from("scores").select("student_id").eq("id", id).maybeSingle();
  if (!score) return;
  const { data: all } = await supabase
    .from("scores")
    .select("id")
    .eq("student_id", score.student_id)
    .eq("archived", false)
    .order("sort_order")
    .order("created_at");
  const ids = (all ?? []).map((s) => s.id);
  const i = ids.indexOf(id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= ids.length) return;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  await Promise.all(ids.map((sid, n) => supabase.from("scores").update({ sort_order: n }).eq("id", sid)));
  revalidatePath(`/students/${score.student_id}/music`);
}

export async function deleteScore(fd: FormData) {
  await requireTeacher();
  const id = String(fd.get("score_id") ?? "");
  const supabase = await createClient();
  const { data: score } = await supabase.from("scores").select("*").eq("id", id).maybeSingle();
  if (!score) return;
  const paths = parsePages(score.pages).map((p) => p.path);
  if (paths.length) await supabase.storage.from(SCORES_BUCKET).remove(paths);
  await supabase.from("scores").delete().eq("id", id);
  revalidatePath(`/students/${score.student_id}/music`);
}

/** Opens the music stand on today's lesson for a student, starting a draft lesson if needed. */
export async function openMusicStand(fd: FormData) {
  const { teacher } = await requireTeacher();
  const studentId = String(fd.get("student_id") ?? "");
  const lessonId = await findOrCreateTodayLesson(studentId, teacher.id);
  if (!lessonId) redirect(`/students/${studentId}?error=lesson`);
  revalidatePath(`/students/${studentId}`);
  redirect(`/lessons/${lessonId}/stand`);
}
