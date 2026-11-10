"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireTeacher } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SCORES_BUCKET } from "@/lib/constants";
import { titleFromFileName } from "@/lib/score-analysis";
import { findTodayLesson } from "@/lib/lesson-today";
import { pageFiles, parsePages, parseRect, type ScorePage } from "@/lib/stand-timeline";
import { isMat3, mapBars, mapRect, refit, type Mat3 } from "@/lib/page-fit";
import { parseMusicLinks } from "@/lib/music-links";
import { parseDetails, type ScoreDetails } from "@/lib/score-analysis";
import type { Json } from "@/lib/supabase/types";
import { saveBarPages } from "@/lib/ai/number-bars";
import { MUSIC_RIGHTS_STATEMENT, MUSIC_RIGHTS_VERSION, type RightsConfirmation } from "@/lib/music-rights";

export type StartScoreResult = { id: string; prefix: string; rightsId: string } | { error: string };
export type ScoreSource = { path: string; name: string; size: number };

const RIGHTS_NEEDED = "Tick the box to confirm you own this copy of the music.";
const RIGHTS_NOT_SAVED =
  "Couldn't record the copyright confirmation. Has music-rights.sql been run in Supabase?";

function rightsOk(r: RightsConfirmation | undefined): boolean {
  return !!r && r.confirmed === true && r.version === MUSIC_RIGHTS_VERSION;
}

/** Keeps the uploader's sign-off (who, when, exact wording) before any file goes up. */
async function recordRights(input: {
  teacherId: string;
  userId: string;
  email: string;
  studentId: string;
  scoreId: string;
  action: "upload" | "replace";
  fileNames: string[];
}): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("music_rights_confirmations")
    .insert({
      teacher_id: input.teacherId,
      student_id: input.studentId,
      score_id: input.scoreId,
      confirmed_by: input.userId,
      confirmed_email: input.email,
      statement_version: MUSIC_RIGHTS_VERSION,
      statement: MUSIC_RIGHTS_STATEMENT,
      action: input.action,
      file_names: input.fileNames.map((n) => String(n).slice(0, 200)).slice(0, 200),
    })
    .select("id")
    .single();
  return error || !data ? null : data.id;
}

// Each upload of a score's file goes in its own folder, so Replace file can
// put the new pages in place before the old ones are removed.
function uploadFolder(teacherId: string, studentId: string, scoreId: string): string {
  return `${teacherId}/${studentId}/${scoreId}/${Date.now().toString(36)}/`;
}

/**
 * Creates the score row, named after the file for now (Claude renames it once
 * it has read the music). The browser then uploads under `prefix`.
 */
export async function startScore(input: {
  studentId: string;
  fileName: string;
  fileNames: string[];
  rights: RightsConfirmation;
}): Promise<StartScoreResult> {
  if (!rightsOk(input.rights)) return { error: RIGHTS_NEEDED };
  const { teacher, userId, email } = await requireTeacher();
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
  const rightsId = await recordRights({
    teacherId: teacher.id,
    userId,
    email,
    studentId: student.id,
    scoreId: id,
    action: "upload",
    fileNames: input.fileNames ?? [],
  });
  if (!rightsId) {
    await supabase.from("scores").delete().eq("id", id);
    return { error: RIGHTS_NOT_SAVED };
  }
  return { id, prefix: uploadFolder(teacher.id, student.id, id), rightsId };
}

/** A fresh folder for a score's replacement file. */
export async function startReplaceScore(
  scoreId: string,
  fileNames: string[],
  rights: RightsConfirmation,
): Promise<StartScoreResult> {
  if (!rightsOk(rights)) return { error: RIGHTS_NEEDED };
  const { teacher, userId, email } = await requireTeacher();
  const supabase = await createClient();
  const { data: score } = await supabase.from("scores").select("id, student_id").eq("id", scoreId).maybeSingle();
  if (!score) return { error: "That music wasn't found." };
  const rightsId = await recordRights({
    teacherId: teacher.id,
    userId,
    email,
    studentId: score.student_id,
    scoreId: score.id,
    action: "replace",
    fileNames: fileNames ?? [],
  });
  if (!rightsId) return { error: RIGHTS_NOT_SAVED };
  return { id: score.id, prefix: uploadFolder(teacher.id, score.student_id, score.id), rightsId };
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
  rightsId: string,
): Promise<{ ok: boolean }> {
  const { teacher } = await requireTeacher();
  const supabase = await createClient();
  const { data: score } = await supabase.from("scores").select("*").eq("id", id).maybeSingle();
  if (!score) return { ok: false };
  // No file is saved without the sign-off made for it.
  const { data: rights } = await supabase
    .from("music_rights_confirmations")
    .select("id, confirmed_at, confirmed_email, statement_version")
    .eq("id", String(rightsId ?? ""))
    .eq("score_id", id)
    .maybeSingle();
  if (!rights) return { ok: false };
  const prefix = `${teacher.id}/${score.student_id}/${id}/`;
  const clean = parsePages(pages as unknown as Json).filter((p) => pageFiles(p).every((f) => f.startsWith(prefix)));
  if (clean.length === 0) return { ok: false };
  const src = source && typeof source.path === "string" && source.path.startsWith(prefix) ? source : null;

  const { error } = await supabase
    .from("scores")
    .update({
      pages: clean,
      source_path: src?.path ?? null,
      source_name: src ? String(src.name).slice(0, 200) : null,
      source_size: src ? Math.max(0, Math.round(Number(src.size) || 0)) : null,
      // Waits for the teacher to check the pages and details (confirmScore).
      analysis: { review: "pending" },
      analysis_status: "none",
      analysis_error: null,
      // Also stops a read of the old file from saving over this one.
      analysis_at: null,
      rights_confirmation_id: rights.id,
      rights_confirmed_at: rights.confirmed_at,
      rights_confirmed_email: rights.confirmed_email,
      rights_version: rights.statement_version,
      ...(score.title_auto ? { title: titleFromFileName(String(fileName ?? "")) } : {}),
    })
    .eq("id", id);
  if (error) return { ok: false };

  // Old files from before a Replace file.
  const keep = new Set([...clean.flatMap(pageFiles), ...(src ? [src.path] : [])]);
  const old = [...parsePages(score.pages).flatMap(pageFiles), ...(score.source_path ? [score.source_path] : [])].filter(
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
  const paths = [...parsePages(score.pages).flatMap(pageFiles), ...(score.source_path ? [score.source_path] : [])];
  if (paths.length) await supabase.storage.from(SCORES_BUCKET).remove(paths);
  await supabase.from("scores").delete().eq("id", id);
  revalidatePath(`/students/${score.student_id}/music`);
}

/**
 * Opens the music stand. If a lesson is running for the student (Start lesson
 * in the last 12 h) the stand joins it; otherwise it opens on its own and
 * records nothing. It never starts a lesson.
 */
export async function openMusicStand(fd: FormData) {
  await requireTeacher();
  const studentId = String(fd.get("student_id") ?? "");
  const lessonId = await findTodayLesson(studentId);
  redirect(lessonId ? `/lessons/${lessonId}/stand` : `/students/${studentId}/stand`);
}

/** The teacher's corrections to a score's bar map (one or more pages). */
export async function saveBarMap(
  scoreId: string,
  changes: { page: number; bars: unknown }[],
): Promise<{ ok: boolean; error?: string }> {
  await requireTeacher();
  return saveBarPages(String(scoreId), changes);
}

export type ScanChange = {
  /** Upload page number (1-based). */
  page: number;
  /** The new clean page, uploaded beside the photo. */
  path: string;
  w: number;
  h: number;
  /** Photo (fractions) → clean page (fractions). */
  fit: Mat3;
  whole?: boolean;
};

/**
 * Saves digitized pages: each becomes the page every view shows, and the
 * photo it came from is kept as the original (shown only on "Show original
 * pictures"). Everything drawn on the old page (stand marks, the bars a
 * lesson clip highlights, the bar map) is moved onto the new page.
 */
export async function saveScan(scoreId: string, changes: ScanChange[]): Promise<{ ok: boolean; error?: string }> {
  const { teacher } = await requireTeacher();
  const supabase = await createClient();
  const { data: score } = await supabase.from("scores").select("*").eq("id", String(scoreId)).maybeSingle();
  if (!score) return { ok: false, error: "That music wasn't found." };
  const prefix = `${teacher.id}/${score.student_id}/${score.id}/`;
  const raw = Array.isArray(score.pages) ? (score.pages as Record<string, unknown>[]) : [];
  const parsed = parsePages(score.pages);
  if (raw.length !== parsed.length) return { ok: false, error: "This music's pages couldn't be read." };

  const now = new Date().toISOString();
  const moves = new Map<number, Mat3>(); // page number → old geometry to new
  const remove: string[] = [];
  const next = raw.map((entry) => ({ ...entry }));
  let done = 0;
  for (const c of Array.isArray(changes) ? changes : []) {
    const n = Math.round(Number(c?.page));
    const old = parsed[n - 1];
    if (!old || typeof c.path !== "string" || !c.path.startsWith(prefix) || !isMat3(c.fit)) continue;
    const w = Math.round(Number(c.w));
    const h = Math.round(Number(c.h));
    if (!(w > 0 && h > 0)) continue;
    const original = old.original ?? { path: old.path, w: old.w, h: old.h };
    // A clean page made before is replaced.
    if (old.original && old.path !== c.path) remove.push(old.path);
    const move = refit(old.fit, c.fit);
    if (move) moves.set(n, move);
    const entry: Record<string, unknown> = {
      ...raw[n - 1],
      path: c.path,
      w,
      h,
      original,
      fit: c.fit,
      scanned_at: now,
      whole: c.whole === true,
    };
    if (move && entry.bars) entry.bars = mapBars(move, entry.bars);
    next[n - 1] = entry;
    done++;
  }
  if (!done) return { ok: false, error: "No pages were digitized." };

  const { error } = await supabase
    .from("scores")
    .update({ pages: next as unknown as Json })
    .eq("id", score.id);
  if (error) return { ok: false, error: "Couldn't save the digitized pages. Try again." };
  if (remove.length) await supabase.storage.from(SCORES_BUCKET).remove(remove);

  if (moves.size) await moveMarks(score.id, score.student_id, moves);

  revalidatePath(`/students/${score.student_id}/music`);
  revalidatePath(`/students/${score.student_id}/music/${score.id}`);
  return { ok: true };
}

/** Moves the boxes saved on a score's pages (stand marks, lesson-clip highlights) to the new page geometry. */
async function moveMarks(scoreId: string, studentId: string, moves: Map<number, Mat3>) {
  const supabase = await createClient();
  const { data: marks } = await supabase
    .from("stand_events")
    .select("id, page, rect")
    .eq("score_id", scoreId)
    .not("rect", "is", null);
  await Promise.all(
    (marks ?? []).map((m) => {
      const move = m.page ? moves.get(m.page) : undefined;
      const rect = parseRect(m.rect);
      if (!move || !rect) return null;
      return supabase
        .from("stand_events")
        .update({ rect: mapRect(move, rect) as unknown as Json })
        .eq("id", m.id);
    }),
  );

  const { data: lessons } = await supabase.from("lessons").select("id").eq("student_id", studentId);
  const ids = (lessons ?? []).map((l) => l.id);
  if (!ids.length) return;
  const { data: rows } = await supabase.from("lesson_transcripts").select("id, draft").in("lesson_id", ids);
  await Promise.all(
    (rows ?? []).map((row) => {
      const links = parseMusicLinks(row.draft);
      if (!links) return null;
      let changed = false;
      const draft = row.draft as Record<string, unknown>;
      const stored = (draft.music_links as { links?: unknown[] }).links ?? [];
      const moved = stored.map((l) => {
        const music = (l as { music?: Record<string, unknown> | null })?.music;
        const page = Number(music?.page);
        const move = music && music.scoreId === scoreId ? moves.get(page) : undefined;
        const box = music?.box as { x: number; y: number; w: number; h: number } | null | undefined;
        if (!move || !box || typeof box !== "object") return l;
        changed = true;
        return { ...(l as object), music: { ...music, box: mapRect(move, box) } };
      });
      if (!changed) return null;
      return supabase
        .from("lesson_transcripts")
        .update({ draft: { ...draft, music_links: { ...(draft.music_links as object), links: moved } } as unknown as Json })
        .eq("id", row.id);
    }),
  );
}

/**
 * The teacher has checked a new upload: the digitized pages look right and
 * the details are corrected. It goes into the music library (and onto the
 * stand) from here.
 */
export async function confirmScore(
  scoreId: string,
  input: { title: string; details: ScoreDetails },
): Promise<{ ok: boolean; error?: string }> {
  const { email } = await requireTeacher();
  const supabase = await createClient();
  const { data: score } = await supabase.from("scores").select("*").eq("id", String(scoreId)).maybeSingle();
  if (!score) return { ok: false, error: "That music wasn't found." };
  if (score.analysis_status === "running") return { ok: false, error: "Claude is still reading the music. One moment." };
  const title = String(input?.title ?? "").trim().slice(0, 120) || score.title;
  const raw = (score.analysis && typeof score.analysis === "object" && !Array.isArray(score.analysis)
    ? score.analysis
    : {}) as Record<string, unknown>;
  const analysis = {
    ...raw,
    details: parseDetails(input?.details),
    review: "confirmed",
    confirmed_at: new Date().toISOString(),
    confirmed_by: email,
  };
  const { error } = await supabase
    .from("scores")
    .update({
      analysis: analysis as unknown as Json,
      title,
      title_auto: title === score.title ? score.title_auto : false,
    })
    .eq("id", score.id);
  if (error) return { ok: false, error: "Couldn't save. Try again." };
  revalidatePath(`/students/${score.student_id}/music`);
  revalidatePath(`/students/${score.student_id}`);
  return { ok: true };
}
