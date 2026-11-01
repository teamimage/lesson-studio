"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireTeacher } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SCORES_BUCKET } from "@/lib/constants";
import { titleFromFileName } from "@/lib/score-analysis";
import { findOrCreateTodayLesson } from "@/lib/lesson-today";
import { parsePages, type ScorePage } from "@/lib/stand-timeline";

export type StartScoreResult = { id: string; prefix: string } | { error: string };
export type ScoreSource = { path: string; name: string; size: number };

// Each upload of a score's file goes in its own folder, so Replace file can
// put the new pages in place before the old ones are removed.
function uploadFolder(teacherId: string, studentId: string, scoreId: string): string {
  return `${teacherId}/${studentId}/${scoreId}/${Date.now().toString(36)}/`;
}

/**
 * Creates the score row, named after the file for now (Claude renames it once
 * it has read the music). The browser then uploads under `prefix`.
 */
export async function startScore(input: { studentId: string; fileName: string }): Promise<StartScoreResult> {
  const { teacher } = await requireTeacher();
  const supabase = await createClient();
  const title = titleFromFileName(String(input.fileName ?? ""));

  const { data: student } = await supabase.from("students").select("id").eq("id", input.studentId).maybeSingle();
  if (!student) return { error: "That student wasn't found." };
  const { count } = await supabase.from("scores").select("id", { count: "exact", head: true }).eq("student_id", student.id);

  const id = crypto.randomUUID();
  const { error } = await supabase.from("scores").insert({
    id,
    teacher_id: teacher.id,
    student_id: student.id,
    title,
    title_auto: true,
    kind: "piece",
    sort_order: count ?? 0,
  });
  if (error) return { error: "Couldn't save that. Try again." };
  return { id, prefix: uploadFolder(teacher.id, student.id, id) };
}

/** A fresh folder for a score's replacement file. */
export async function startReplaceScore(scoreId: string): Promise<StartScoreResult> {
  const { teacher } = await requireTeacher();
  const supabase = await createClient();
  const { data: score } = await supabase.from("scores").select("id, student_id").eq("id", scoreId).maybeSingle();
  if (!score) return { error: "That music wasn't found." };
  return { id: score.id, prefix: uploadFolder(teacher.id, score.student_id, score.id) };
}

/**
 * Saves the uploaded page list (and the original file) once everything is in
 * storage. On a replace, the old pages and old original are removed and the
 * pieces Claude found are cleared, ready for a new read.
 */
export async function finishScore(
  id: string,
  pages: ScorePage[],
  source: ScoreSource | null,
  fileName: string,
): Promise<{ ok: boolean }> {
  const { teacher } = await requireTeacher();
  const supabase = await createClient();
  const { data: score } = await supabase.from("scores").select("*").eq("id", id).maybeSingle();
  if (!score) return { ok: false };
  const prefix = `${teacher.id}/${score.student_id}/${id}/`;
  const clean = parsePages(pages).filter((p) => p.path.startsWith(prefix));
  if (clean.length === 0) return { ok: false };
  const src = source && typeof source.path === "string" && source.path.startsWith(prefix) ? source : null;

  const { error } = await supabase
    .from("scores")
    .update({
      pages: clean,
      source_path: src?.path ?? null,
      source_name: src ? String(src.name).slice(0, 200) : null,
      source_size: src ? Math.max(0, Math.round(Number(src.size) || 0)) : null,
      analysis: null,
      analysis_status: "none",
      analysis_error: null,
      // Also stops a read of the old file from saving over this one.
      analysis_at: null,
      ...(score.title_auto ? { title: titleFromFileName(String(fileName ?? "")) } : {}),
    })
    .eq("id", id);
  if (error) return { ok: false };

  // Old files from before a Replace file.
  const keep = new Set([...clean.map((p) => p.path), ...(src ? [src.path] : [])]);
  const old = [...parsePages(score.pages).map((p) => p.path), ...(score.source_path ? [score.source_path] : [])].filter(
    (p) => !keep.has(p),
  );
  if (old.length) await supabase.storage.from(SCORES_BUCKET).remove(old);

  revalidatePath(`/students/${score.student_id}/music`);
  return { ok: true };
}

export async function renameScore(fd: FormData) {
  await requireTeacher();
  const id = String(fd.get("score_id") ?? "");
  const title = String(fd.get("title") ?? "").trim().slice(0, 120);
  if (!title) return;
  const supabase = await createClient();
  const { data } = await supabase
    .from("scores")
    .update({ title, title_auto: false })
    .eq("id", id)
    .select("student_id")
    .maybeSingle();
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
  // The whole upload goes: original file, every page image, and the pieces
  // found in it (they live on this row).
  const paths = [...parsePages(score.pages).map((p) => p.path), ...(score.source_path ? [score.source_path] : [])];
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
