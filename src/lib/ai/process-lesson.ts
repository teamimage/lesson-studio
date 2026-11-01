import "server-only";
import { createClient } from "@/lib/supabase/server";
import { RECORDINGS_BUCKET } from "@/lib/constants";
import { booksFor } from "@/lib/suzuki";
import type { Json, Tables } from "@/lib/supabase/types";
import { getTranscription, MissingKeyError, submitTranscription } from "./assemblyai";
import { DraftError, draftLesson, type LessonDraft } from "./draft-lesson";
import { claudeCost, TRANSCRIPTION_MODEL, transcriptionCost, type ClaudeUsage } from "./pricing";

// Lesson video → transcript → drafted lesson record.
//
//   start()    asks AssemblyAI to fetch the video from a signed link.
//   advance()  is called by the lesson page every few seconds. Once the
//              transcript is ready it saves it, then has Claude draft the
//              lesson and writes the draft into the lesson's empty fields.
//   redraft()  runs Claude again on the saved transcript (no new
//              transcription cost) and replaces the draft fields.
//
// Each step moves the row's status with a conditional update, so two
// browser tabs polling at once can't run (and pay for) a step twice.

export type Transcript = Tables<"lesson_transcripts">;
export type ProcessState = {
  status: "none" | "transcribing" | "drafting" | "done" | "error";
  error?: string | null;
  recordingId?: string;
  applied?: boolean;
  /** When the current step began, for the progress bar. */
  since?: string;
};

const SETUP_ERROR =
  "The AI tables aren't set up in Supabase yet. Run ai-processing.sql in the Supabase SQL Editor, then press Process video again.";

// The signed link must stay valid until AssemblyAI has fetched the file.
const LINK_SECONDS = 24 * 60 * 60;
// A drafting step that hasn't finished by now died with its function.
const DRAFT_STALE_MS = 6 * 60 * 1000;

type Db = Awaited<ReturnType<typeof createClient>>;

export function stateOf(row: Transcript | null): ProcessState {
  if (!row) return { status: "none" };
  const draft = row.draft as { applied?: boolean } | null;
  return {
    status: row.status as ProcessState["status"],
    error: row.error,
    recordingId: row.recording_id,
    applied: draft?.applied,
    since: row.updated_at,
  };
}

export async function latestTranscript(db: Db, lessonId: string): Promise<Transcript | null> {
  const { data } = await db
    .from("lesson_transcripts")
    .select("*")
    .eq("lesson_id", lessonId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

function messageOf(e: unknown): string {
  if (e instanceof MissingKeyError || e instanceof DraftError) return e.message;
  if (e instanceof Error && e.message) return e.message.slice(0, 300);
  return "Something went wrong.";
}

export async function start(teacherId: string, lessonId: string, recordingId: string): Promise<ProcessState> {
  const db = await createClient();
  const { data: rec } = await db.from("recordings").select("*").eq("id", recordingId).maybeSingle();
  if (!rec || rec.lesson_id !== lessonId || rec.status !== "ready")
    return { status: "error", error: "That video isn't uploaded yet." };

  const { data: existing, error: tableError } = await db
    .from("lesson_transcripts")
    .select("*")
    .eq("recording_id", rec.id)
    .maybeSingle();
  // Check the tables exist before paying for a transcription that couldn't be saved.
  if (tableError) return { status: "error", error: SETUP_ERROR };
  if (existing?.status === "transcribing" || existing?.status === "drafting") return stateOf(existing);
  if (existing?.transcript) return redraft(teacherId, lessonId);

  try {
    const { data: signed, error } = await db.storage.from(RECORDINGS_BUCKET).createSignedUrl(rec.storage_path, LINK_SECONDS);
    if (error || !signed) throw new Error("Couldn't make a link to the video.");
    const jobId = await submitTranscription(signed.signedUrl, await keyterms(db, rec.student_id));
    const row = {
      teacher_id: teacherId,
      lesson_id: lessonId,
      recording_id: rec.id,
      status: "transcribing",
      provider_job_id: jobId,
      error: null,
      updated_at: new Date().toISOString(),
    };
    const { data: saved, error: saveError } = await db
      .from("lesson_transcripts")
      .upsert(row, { onConflict: "recording_id" })
      .select("*")
      .single();
    if (saveError || !saved) throw new Error(`Couldn't save the job: ${saveError?.message ?? "no row"}`);
    return stateOf(saved);
  } catch (e) {
    return { status: "error", error: messageOf(e), recordingId: rec.id };
  }
}

export async function advance(teacherId: string, lessonId: string): Promise<ProcessState> {
  const db = await createClient();
  const row = await latestTranscript(db, lessonId);
  if (!row) return { status: "none" };

  if (row.status === "drafting" && Date.now() - Date.parse(row.updated_at) > DRAFT_STALE_MS) {
    const { data } = await db
      .from("lesson_transcripts")
      .update({ status: "error", error: "Drafting stopped part way. Press Try again.", updated_at: now() })
      .eq("id", row.id)
      .eq("status", "drafting")
      .select("*")
      .maybeSingle();
    return stateOf(data ?? row);
  }
  if (row.status !== "transcribing" || !row.provider_job_id) return stateOf(row);

  let result;
  try {
    result = await getTranscription(row.provider_job_id);
  } catch (e) {
    return { ...stateOf(row), error: messageOf(e) };
  }
  if (result.status === "pending") return stateOf(row);
  if (result.status === "error") {
    const { data } = await db
      .from("lesson_transcripts")
      .update({ status: "error", error: `Transcription failed: ${result.error}`, updated_at: now() })
      .eq("id", row.id)
      .select("*")
      .maybeSingle();
    return stateOf(data ?? row);
  }

  // Claim the next step; whoever wins logs the transcription cost and drafts.
  const { data: claimed } = await db
    .from("lesson_transcripts")
    .update({
      status: "drafting",
      transcript: result.text,
      audio_seconds: result.audioSeconds,
      error: null,
      updated_at: now(),
    })
    .eq("id", row.id)
    .eq("status", "transcribing")
    .select("*")
    .maybeSingle();
  if (!claimed) return stateOf(await latestTranscript(db, lessonId));

  await db.from("ai_usage").insert({
    teacher_id: teacherId,
    lesson_id: lessonId,
    recording_id: claimed.recording_id,
    kind: "transcription",
    provider: "assemblyai",
    model: TRANSCRIPTION_MODEL,
    audio_seconds: result.audioSeconds,
    cost_usd: round(transcriptionCost(result.audioSeconds)),
  });

  return runDraft(db, teacherId, claimed, false);
}

export async function redraft(teacherId: string, lessonId: string): Promise<ProcessState> {
  const db = await createClient();
  const row = await latestTranscript(db, lessonId);
  if (!row?.transcript) return { status: "error", error: "There's no transcript to draft from yet." };
  const { data: claimed } = await db
    .from("lesson_transcripts")
    .update({ status: "drafting", error: null, updated_at: now() })
    .eq("id", row.id)
    .in("status", ["done", "error"])
    .select("*")
    .maybeSingle();
  if (!claimed) return stateOf(row);
  return runDraft(db, teacherId, claimed, true);
}

async function runDraft(db: Db, teacherId: string, row: Transcript, replace: boolean): Promise<ProcessState> {
  let draft: LessonDraft;
  let usage: ClaudeUsage[] = [];
  try {
    const ctx = await draftContext(db, row);
    const out = await draftLesson(ctx);
    draft = out.draft;
    usage = out.usage;
  } catch (e) {
    if (e instanceof DraftError) usage = e.usage;
    await logClaude(db, teacherId, row, usage);
    const { data } = await db
      .from("lesson_transcripts")
      .update({ status: "error", error: messageOf(e), updated_at: now() })
      .eq("id", row.id)
      .select("*")
      .maybeSingle();
    return stateOf(data ?? row);
  }
  await logClaude(db, teacherId, row, usage);

  const applied = await applyDraft(db, row.lesson_id, draft, replace, Number(row.audio_seconds) || 0);
  const { data } = await db
    .from("lesson_transcripts")
    .update({ status: "done", draft: { ...draft, applied } as unknown as Json, updated_at: now() })
    .eq("id", row.id)
    .select("*")
    .maybeSingle();
  return stateOf(data ?? row);
}

async function logClaude(db: Db, teacherId: string, row: Transcript, usage: ClaudeUsage[]) {
  if (!usage.length) return;
  await db.from("ai_usage").insert(
    usage.map((u) => ({
      teacher_id: teacherId,
      lesson_id: row.lesson_id,
      recording_id: row.recording_id,
      kind: "draft",
      provider: "anthropic",
      model: u.model,
      input_tokens: u.input_tokens,
      output_tokens: u.output_tokens,
      cache_read_tokens: u.cache_read_tokens,
      cache_write_tokens: u.cache_write_tokens,
      cost_usd: round(claudeCost(u)),
    })),
  );
}

/**
 * Writes the draft into the lesson. The first run only fills fields that
 * are empty; "Draft again" (replace) overwrites them. Approved lessons are
 * never changed: the draft stays on the transcript row instead.
 */
async function applyDraft(
  db: Db,
  lessonId: string,
  d: LessonDraft,
  replace: boolean,
  audioSeconds: number,
): Promise<boolean> {
  const { data: lesson } = await db
    .from("lessons")
    .select("*, lesson_pieces(id), assignments(id)")
    .eq("id", lessonId)
    .maybeSingle();
  if (!lesson || lesson.status !== "draft") return false;

  const pick = (current: string | null, next: string) => {
    const v = next.trim();
    if (!v) return current;
    return replace || !current?.trim() ? v : current;
  };
  await db
    .from("lessons")
    .update({
      summary: pick(lesson.summary, d.summary),
      focus_points: pick(lesson.focus_points, d.focus_points),
      parent_message: pick(lesson.parent_message, d.parent_message),
      suggestions: pick(lesson.suggestions, d.suggestions),
      teacher_notes: pick(lesson.teacher_notes, d.teacher_notes),
      duration_minutes: lesson.duration_minutes ?? (audioSeconds ? Math.round(audioSeconds / 60) : null),
    })
    .eq("id", lessonId);

  const pieces = d.pieces.filter((p) => p.title.trim());
  if (pieces.length && (replace || lesson.lesson_pieces.length === 0)) {
    await db.from("lesson_pieces").delete().eq("lesson_id", lessonId);
    await db.from("lesson_pieces").insert(
      pieces.map((p, i) => ({
        lesson_id: lessonId,
        title: p.title.trim(),
        activity: p.activity,
        notes: p.notes.trim() || null,
        sort_order: i + 1,
      })),
    );
  }
  const assignments = d.assignments.filter((a) => a.title.trim());
  if (assignments.length && (replace || lesson.assignments.length === 0)) {
    // Draft lessons aren't visible to families, so no practice checkmarks point at these yet.
    await db.from("assignments").delete().eq("lesson_id", lessonId);
    await db.from("assignments").insert(
      assignments.map((a, i) => ({
        lesson_id: lessonId,
        student_id: lesson.student_id,
        kind: a.kind,
        title: a.title.trim(),
        how: a.how.trim() || null,
        every_day: a.every_day,
        sort_order: i + 1,
      })),
    );
  }
  return true;
}

async function draftContext(db: Db, row: Transcript) {
  const { data: lesson } = await db.from("lessons").select("*").eq("id", row.lesson_id).single();
  if (!lesson) throw new Error("That lesson wasn't found.");
  const [{ data: student }, { data: rep }, { data: prev }] = await Promise.all([
    db.from("students").select("*").eq("id", lesson.student_id).single(),
    db.from("repertoire").select("title, status").eq("student_id", lesson.student_id).order("started_on"),
    db
      .from("lessons")
      .select("lesson_date, summary, assignments(title, how)")
      .eq("student_id", lesson.student_id)
      .eq("status", "approved")
      .lt("lesson_date", lesson.lesson_date)
      .order("lesson_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (!student) throw new Error("That student wasn't found.");
  return {
    studentName: student.name,
    instrument: student.instrument,
    age: student.age,
    currentBook: student.current_book,
    lessonDate: lesson.lesson_date,
    bookPieces: bookPieces(student.instrument, student.current_book),
    repertoire: rep ?? [],
    lastLesson: prev
      ? {
          date: prev.lesson_date,
          summary: prev.summary,
          assignments: prev.assignments.map((a) => (a.how ? `${a.title}: ${a.how}` : a.title)),
        }
      : null,
    transcript: row.transcript ?? "",
  };
}

// The student's book and the ones before it, plus the next one.
function bookPieces(instrument: string, currentBook: string | null): string[] {
  const books = booksFor(instrument);
  const idx = currentBook ? books.findIndex((b) => b.book === currentBook) : -1;
  const upto = idx >= 0 ? idx + 2 : Math.min(books.length, 2);
  return books.slice(0, upto).flatMap((b) => b.pieces.map((p) => `${p} (${b.book})`));
}

async function keyterms(db: Db, studentId: string): Promise<string[]> {
  const [{ data: student }, { data: rep }] = await Promise.all([
    db.from("students").select("name, instrument, current_book").eq("id", studentId).single(),
    db.from("repertoire").select("title").eq("student_id", studentId),
  ]);
  const titles = new Set<string>();
  if (student) {
    titles.add(student.name.split(" ")[0]);
    for (const p of bookPieces(student.instrument, student.current_book)) titles.add(p.replace(/ \(.*\)$/, ""));
  }
  for (const r of rep ?? []) titles.add(r.title);
  // AssemblyAI takes phrases of up to six words.
  return [...titles].filter((t) => t && t.split(/\s+/).length <= 6);
}

function now() {
  return new Date().toISOString();
}
function round(n: number) {
  return Math.round(n * 1_000_000) / 1_000_000;
}
