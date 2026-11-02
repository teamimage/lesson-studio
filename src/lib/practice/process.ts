import "server-only";
import { createClient } from "@/lib/supabase/server";
import { PRACTICE_BUCKET } from "@/lib/constants";
import type { Json, Tables } from "@/lib/supabase/types";
import { getTranscription, MissingKeyError, submitTranscription } from "@/lib/ai/assemblyai";
import { analyzePractice, type PracticeAnalysis } from "@/lib/ai/analyze-practice";
import { DraftError } from "@/lib/ai/draft-lesson";
import { bookPieces } from "@/lib/ai/process-lesson";
import { claudeCost, TRANSCRIPTION_MODEL, transcriptionCost, type ClaudeUsage } from "@/lib/ai/pricing";
import { activityText, parseActivity, tooQuiet } from "./activity";

// A practice session after Stop:
//
//   finishUpload()  the file is in storage. Sessions with almost no musical
//                   sound are marked "not counted" right away. Otherwise
//                   AssemblyAI is asked to transcribe any talking.
//   advance()       called every few seconds by any open page showing the
//                   session. When the transcript is in, Claude reviews the
//                   session, the practice log is ticked, and the recording
//                   is deleted.
//   retry()         runs the review again after an error.
//
// Each step moves `status` with a conditional update, so two open pages
// can't run (and pay for) the same step twice.

export type PracticeSession = Tables<"practice_sessions">;
export type PracticeState = { status: PracticeSession["status"]; error: string | null; counted: boolean | null };

type Db = Awaited<ReturnType<typeof createClient>>;

const LINK_SECONDS = 24 * 60 * 60;
const STALE_MS = 6 * 60 * 1000;
const SETUP_ERROR =
  "Practice sessions aren't set up in Supabase yet. Run practice-sessions.sql in the Supabase SQL Editor.";

export function stateOf(s: PracticeSession): PracticeState {
  return { status: s.status, error: s.error, counted: s.counted };
}

async function load(db: Db, id: string): Promise<PracticeSession | null> {
  const { data } = await db.from("practice_sessions").select("*").eq("id", id).maybeSingle();
  return data;
}

async function patch(db: Db, id: string, change: Partial<PracticeSession>, fromStatus?: string[]) {
  let q = db
    .from("practice_sessions")
    .update({ ...change, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (fromStatus) q = q.in("status", fromStatus);
  const { data } = await q.select("*").maybeSingle();
  return data;
}

function messageOf(e: unknown): string {
  if (e instanceof MissingKeyError || e instanceof DraftError) return e.message;
  if (e instanceof Error && e.message) return e.message.slice(0, 300);
  return "Something went wrong.";
}

export async function finishUpload(id: string): Promise<PracticeState> {
  const db = await createClient();
  const s = await load(db, id);
  if (!s) return { status: "error", error: SETUP_ERROR, counted: null };
  if (s.status !== "uploading") return stateOf(s);

  const activity = parseActivity(s.activity);
  if (tooQuiet(activity, s.duration_seconds)) {
    const analysis: PracticeAnalysis = {
      counted: false,
      not_counted_reason: "The recording was almost silent, so there wasn't any playing to count.",
      summary: "We didn't hear much playing in this one.",
      items: [],
      other: [],
      timeline: [],
      flow: "If the phone was far away or the microphone was blocked, try setting it a little closer next time.",
      tips: [],
      teacher_note: "",
    };
    const done = await patch(
      db,
      id,
      { status: "done", counted: false, analysis: analysis as unknown as Json, applied: true },
      ["uploading"],
    );
    await deleteRecording(db, done ?? s);
    return stateOf(done ?? s);
  }

  // Transcribing the talking helps but isn't essential: without a key, or if
  // it fails, Claude reviews the sound timeline alone.
  let jobId: string | null = null;
  if (s.storage_path && process.env.ASSEMBLYAI_API_KEY) {
    try {
      const { data: signed } = await db.storage.from(PRACTICE_BUCKET).createSignedUrl(s.storage_path, LINK_SECONDS);
      if (signed) jobId = await submitTranscription(signed.signedUrl, []);
    } catch {
      jobId = null;
    }
  }
  if (jobId) {
    const next = await patch(db, id, { status: "transcribing", provider_job_id: jobId, error: null }, ["uploading"]);
    return stateOf(next ?? s);
  }
  const claimed = await patch(db, id, { status: "analyzing", error: null }, ["uploading"]);
  if (!claimed) return stateOf((await load(db, id)) ?? s);
  return review(db, claimed);
}

export async function advance(id: string): Promise<PracticeState | null> {
  const db = await createClient();
  const s = await load(db, id);
  if (!s) return null;

  if (s.status === "analyzing" && Date.now() - Date.parse(s.updated_at) > STALE_MS) {
    const failed = await patch(db, id, { status: "error", error: "The review stopped part way. Press Try again." }, ["analyzing"]);
    return stateOf(failed ?? s);
  }
  if (s.status !== "transcribing" || !s.provider_job_id) return stateOf(s);

  let transcript = "";
  let audioSeconds = 0;
  try {
    const result = await getTranscription(s.provider_job_id);
    if (result.status === "pending") return stateOf(s);
    if (result.status === "completed") {
      transcript = result.text;
      audioSeconds = result.audioSeconds;
    }
  } catch {
    return stateOf(s);
  }

  const claimed = await patch(db, id, { status: "analyzing", transcript, error: null }, ["transcribing"]);
  if (!claimed) return stateOf((await load(db, id)) ?? s);
  if (audioSeconds) {
    await db.from("ai_usage").insert({
      teacher_id: s.teacher_id,
      practice_session_id: s.id,
      kind: "transcription",
      provider: "assemblyai",
      model: TRANSCRIPTION_MODEL,
      audio_seconds: audioSeconds,
      cost_usd: round(transcriptionCost(audioSeconds)),
    });
  }
  return review(db, claimed);
}

export async function retry(id: string): Promise<PracticeState | null> {
  const db = await createClient();
  const s = await load(db, id);
  if (!s) return null;
  const claimed = await patch(db, id, { status: "analyzing", error: null }, ["error"]);
  if (!claimed) return stateOf(s);
  return review(db, claimed);
}

async function review(db: Db, s: PracticeSession): Promise<PracticeState> {
  let usage: ClaudeUsage[] = [];
  let analysis: PracticeAnalysis;
  try {
    const out = await analyzePractice(await contextFor(db, s));
    analysis = out.analysis;
    usage = out.usage;
  } catch (e) {
    if (e instanceof DraftError) usage = e.usage;
    await logClaude(db, s, usage);
    const failed = await patch(db, s.id, { status: "error", error: messageOf(e) });
    // Try again works from the sound timeline and transcript, so the
    // recording itself isn't needed any more.
    await deleteRecording(db, failed ?? s);
    return stateOf(failed ?? s);
  }
  await logClaude(db, s, usage);

  const done = await patch(db, s.id, {
    status: "done",
    counted: analysis.counted,
    analysis: analysis as unknown as Json,
  });
  const row = done ?? s;
  if (!row.applied) await applyToLog(db, row, analysis);
  await deleteRecording(db, row);
  return stateOf(row);
}

/**
 * Ticks the practised assignments in that day's practice log and adds the
 * session's minutes. Runs once per session (guarded by `applied`).
 */
async function applyToLog(db: Db, s: PracticeSession, a: PracticeAnalysis) {
  const { data: claimed } = await db
    .from("practice_sessions")
    .update({ applied: true })
    .eq("id", s.id)
    .eq("applied", false)
    .select("id")
    .maybeSingle();
  if (!claimed || !a.counted) return;

  const ticked = a.items.filter((i) => i.practiced && i.confidence !== "low").map((i) => i.assignment_id);
  const { data: valid } = ticked.length
    ? await db.from("assignments").select("id").eq("student_id", s.student_id).in("id", ticked)
    : { data: [] as { id: string }[] };
  const { data: log } = await db
    .from("practice_logs")
    .select("*")
    .eq("student_id", s.student_id)
    .eq("practice_date", s.practice_date)
    .maybeSingle();
  const completed = [...new Set([...(log?.completed_assignment_ids ?? []), ...(valid ?? []).map((v) => v.id)])];
  const minutes = (log?.minutes ?? 0) + Math.max(1, Math.round(s.duration_seconds / 60));
  await db.from("practice_logs").upsert(
    {
      student_id: s.student_id,
      practice_date: s.practice_date,
      completed_assignment_ids: completed,
      minutes,
      listened: log?.listened ?? false,
      parent_note: log?.parent_note ?? null,
      logged_by: log?.logged_by ?? s.created_by,
    },
    { onConflict: "student_id,practice_date" },
  );
}

export async function deleteRecording(db: Db, s: PracticeSession) {
  if (!s.storage_path) return;
  const { error } = await db.storage.from(PRACTICE_BUCKET).remove([s.storage_path]);
  if (!error) await db.from("practice_sessions").update({ storage_path: null }).eq("id", s.id);
}

async function contextFor(db: Db, s: PracticeSession) {
  const [{ data: student }, { data: lesson }] = await Promise.all([
    db.from("students").select("*").eq("id", s.student_id).single(),
    s.lesson_id
      ? db.from("lessons").select("*, lesson_pieces(*), assignments(*)").eq("id", s.lesson_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  if (!student) throw new Error("That student wasn't found.");
  const activity = parseActivity(s.activity);
  return {
    studentName: student.name,
    instrument: student.instrument,
    age: student.age,
    currentBook: student.current_book,
    bookPieces: bookPieces(student.instrument, student.current_book),
    lessonDate: lesson?.lesson_date ?? null,
    focus: lesson?.focus_points ?? null,
    assignments: (lesson?.assignments ?? [])
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((a) => ({ id: a.id, kind: a.kind, title: a.title, how: a.how })),
    pieces: (lesson?.lesson_pieces ?? []).map((p) => ({ title: p.title, notes: p.notes })),
    durationSeconds: s.duration_seconds,
    playingSeconds: s.playing_seconds,
    activity: activityText(activity),
    transcript: s.transcript ?? "",
  };
}

async function logClaude(db: Db, s: PracticeSession, usage: ClaudeUsage[]) {
  if (!usage.length) return;
  await db.from("ai_usage").insert(
    usage.map((u) => ({
      teacher_id: s.teacher_id,
      practice_session_id: s.id,
      kind: "practice",
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

function round(n: number) {
  return Math.round(n * 1_000_000) / 1_000_000;
}
