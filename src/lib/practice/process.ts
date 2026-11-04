import "server-only";
import { createClient } from "@/lib/supabase/server";
import { PRACTICE_BUCKET } from "@/lib/constants";
import type { Json, Tables } from "@/lib/supabase/types";
import { getTranscription, MissingKeyError, submitTranscription } from "@/lib/ai/assemblyai";
import { analyzePractice, type PracticeAnalysis } from "@/lib/ai/analyze-practice";
import { DraftError } from "@/lib/ai/draft-lesson";
import { bookPieces } from "@/lib/ai/process-lesson";
import { claudeCost, TRANSCRIPTION_MODEL, transcriptionCost, type ClaudeUsage } from "@/lib/ai/pricing";
import { activityText, clock, parseActivity, tooQuiet, tuningChecksOf } from "./activity";
import { tunedWithTuner } from "./tuner";
import { extractNotes } from "./notes";
import { findScales, scaleLabel, summarizeScales, type ScaleSummary } from "./scales";
import { addPieceGroups, intonationText, sessionIntonation, withPrevious } from "./intonation";
import type { SessionIntonation } from "./review-types";
import { matchMusic, musicByPiece, type MusicMatch } from "@/lib/melody";
import { studentMelodies } from "@/lib/ai/transcribe-melody";

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

/**
 * Flags a session whose recording never reached storage. Kept separate from
 * other updates so it does nothing (rather than breaking the update) before
 * practice-upload-fix.sql has added the column.
 */
async function setRecordingMissing(db: Db, id: string, missing: boolean) {
  await db.from("practice_sessions").update({ recording_missing: missing }).eq("id", id);
}

/**
 * The recording finished uploading (or, with `noRecording`, never made it).
 * Without a recording the session is still logged and reviewed from the
 * sound timeline the phone wrote down while recording; only the
 * transcript of any talking is missing.
 */
export async function finishUpload(id: string, opts: { noRecording?: boolean } = {}): Promise<PracticeState> {
  const db = await createClient();
  let s = await load(db, id);
  if (!s) return { status: "error", error: SETUP_ERROR, counted: null };
  if (s.status !== "uploading") return stateOf(s);
  if (opts.noRecording) {
    await setRecordingMissing(db, id, true);
    s = (await patch(db, id, { storage_path: null }, ["uploading"])) ?? s;
  }

  const activity = parseActivity(s.activity);
  if (opts.noRecording && tooQuiet(activity, s.duration_seconds)) {
    // Start and Stop were pressed but neither a recording nor the sound
    // timeline came through. Log the time anyway; there's nothing to review.
    const analysis: PracticeAnalysis = {
      counted: true,
      not_counted_reason: "",
      summary: "Practice logged with Start and Stop. No sound came through from the phone, so there's no review or grade for this one.",
      items: [],
      repertoire: [],
      other: [],
      timeline: [],
      encouragement: "",
      going_well: [],
      work_on: [],
      teacher_note: "Logged by Start/Stop only: no audio recording or sound timeline reached the app.",
    };
    const done = await patch(db, id, { status: "done", counted: true, analysis: analysis as unknown as Json }, ["uploading"]);
    if (done && !done.applied) await applyToLog(db, done, analysis);
    return stateOf(done ?? s);
  }
  if (tooQuiet(activity, s.duration_seconds)) {
    const analysis: PracticeAnalysis = {
      counted: false,
      not_counted_reason: "The recording was almost silent, so there wasn't any playing to count.",
      summary: "We didn't hear much playing in this one.",
      items: [],
      repertoire: [],
      other: [],
      timeline: [],
      encouragement: "",
      going_well: [],
      work_on: [{ text: "Set the phone a little closer next time", topic: "routine", piece: "" }],
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

/**
 * A recording that failed to upload at Stop has now uploaded: clear the
 * warning and review the session again with the transcript. Minutes and
 * ticks were already added to the log the first time (`applied`), so they
 * aren't added twice.
 */
export async function attachRecording(id: string, path: string): Promise<PracticeState | null> {
  const db = await createClient();
  const s = await load(db, id);
  if (!s) return null;
  if (path !== `${s.student_id}/${s.id}.${path.split(".").pop()}`) return stateOf(s);
  if (s.status === "transcribing" || s.status === "analyzing") return stateOf(s);
  const reopened = await patch(db, id, { status: "uploading", storage_path: path, error: null }, ["done", "error"]);
  if (!reopened) return stateOf(s);
  await setRecordingMissing(db, id, false);
  return finishUpload(id);
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
  // A finished review can be written again too (e.g. after the intonation
  // scale changed); the practice log isn't ticked twice (`applied`).
  const claimed = await patch(db, id, { status: "analyzing", error: null }, ["error", "done"]);
  if (!claimed) return stateOf(s);
  return review(db, claimed);
}

async function review(db: Db, s: PracticeSession): Promise<PracticeState> {
  let usage: ClaudeUsage[] = [];
  let analysis: PracticeAnalysis;
  try {
    const ctx = await contextFor(db, s);
    const out = await analyzePractice(ctx);
    analysis = { ...out.analysis, scales: ctx.scales, ...(ctx.music.length ? { music: ctx.music } : {}) };
    if (ctx.intonation && out.analysis.counted) {
      // Each piece gets its own verdict too: where code matched it against the
      // uploaded music, else where Claude's timeline puts it.
      const timeline = [
        ...ctx.music.map((m) => ({ start: clock(m.start), end: clock(m.end), label: m.title })),
        ...out.analysis.timeline.filter((t) => !ctx.music.some((m) => t.label.toLowerCase().includes(m.title.toLowerCase()))),
      ];
      const withPieces = addPieceGroups(ctx.intonation, ctx.notes, timeline, [...ctx.knownTitles, ...ctx.music.map((m) => m.title)]);
      analysis.intonation = withPrevious(withPieces, ctx.earlierIntonation);
    }
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
  const [{ data: student }, { data: lesson }, { data: repertoire }, { data: earlier }, melodies] = await Promise.all([
    db.from("students").select("*").eq("id", s.student_id).single(),
    s.lesson_id
      ? db.from("lessons").select("*, lesson_pieces(*), assignments(*)").eq("id", s.lesson_id).maybeSingle()
      : Promise.resolve({ data: null }),
    db.from("repertoire").select("title, status").eq("student_id", s.student_id),
    db
      .from("practice_sessions")
      .select("practice_date, analysis")
      .eq("student_id", s.student_id)
      .eq("status", "done")
      .neq("id", s.id)
      .lt("started_at", s.started_at)
      .order("started_at", { ascending: false })
      .limit(20),
    studentMelodies(db, s.student_id),
  ]);
  if (!student) throw new Error("That student wasn't found.");
  const activity = parseActivity(s.activity);
  const notes = extractNotes(activity);
  const scales = summarizeScales(findScales(notes));
  const music = matchMusic(
    notes,
    melodies,
    scales.flatMap((g) => g.when),
  );
  const assignments = (lesson?.assignments ?? []).slice().sort((a, b) => a.sort_order - b.sort_order);
  const earlierIntonation = (earlier ?? []).flatMap((e) => {
    const i = (e.analysis as PracticeAnalysis | null)?.intonation;
    return i ? [{ date: e.practice_date, intonation: i as SessionIntonation }] : [];
  });
  const base = sessionIntonation(notes, student.instrument, scales, tunedWithTuner(tuningChecksOf(s.activity)));
  const intonation = base ? withPrevious(base, earlierIntonation) : null;
  const knownTitles = [
    ...assignments.map((a) => a.title),
    ...(lesson?.lesson_pieces ?? []).map((p) => p.title),
    ...(repertoire ?? []).map((r) => r.title),
  ];
  return {
    studentName: student.name,
    instrument: student.instrument,
    age: student.age,
    currentBook: student.current_book,
    bookPieces: bookPieces(student.instrument, student.current_book),
    lessonDate: lesson?.lesson_date ?? null,
    focus: lesson?.focus_points ?? null,
    assignments: assignments.map((a) => ({ id: a.id, kind: a.kind, title: a.title, how: a.how })),
    pieces: (lesson?.lesson_pieces ?? []).map((p) => ({ title: p.title, notes: p.notes })),
    currentPieces: currentPieces(repertoire ?? [], assignments.map((a) => a.title)),
    durationSeconds: s.duration_seconds,
    playingSeconds: s.playing_seconds,
    activity: activityText(activity),
    transcript: s.transcript ?? "",
    scales,
    scalesText: scalesText(scales),
    musicText: musicText(music, melodies.length),
    intonationText: intonation ? intonationText(intonation, notes) : "",
    // Used after the review, not sent to Claude.
    notes,
    music,
    intonation,
    earlierIntonation,
    knownTitles,
  };
}

/** The code's matches against the uploaded music, as lines for Claude. */
function musicText(music: MusicMatch[], pieces: number): string {
  if (!pieces) return "";
  if (!music.length) return `None of the ${pieces} pieces with notes read from the student's uploaded music matched.`;
  const lines = music.map(
    (m) =>
      `${clock(m.start)}-${clock(m.end)}: ${m.title} (${m.score_title}), bars ${m.bars} of ${m.bars_total}, ${m.hits >= 12 ? "strong" : m.hits >= 7 ? "good" : "possible"} match`,
  );
  const pieceLines = musicByPiece(music).map((p) => `${p.title}: bars ${p.bars}, about ${Math.max(1, Math.round(p.seconds / 60))} min`);
  return `${lines.join("\n")}\nBy piece:\n${pieceLines.join("\n")}`;
}

/** The code-found scales as lines for Claude. */
export function scalesText(scales: ScaleSummary[]): string {
  return scales
    .map((g) => {
      const when = g.when.map((w) => `${clock(w.start)}-${clock(w.end)}`).join(", ");
      const off = g.off_notes.length ? `; notes outside the key: ${g.off_notes.join(", ")}` : "";
      return `${scaleLabel(g)}, ${g.octaves} octave${g.octaves === 1 ? "" : "s"}, about ${g.times} time${g.times === 1 ? "" : "s"}, at ${when}${off}`;
    })
    .join("\n");
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

/**
 * The student's current pieces (learning, polishing or on review) that aren't
 * already on the assignment list, so the review can check them off too.
 */
export function currentPieces(rep: { title: string; status: string }[], assignmentTitles: string[]): string[] {
  const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const assigned = assignmentTitles.map(norm);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of rep) {
    if (!["learning", "polishing", "review"].includes(r.status)) continue;
    const t = norm(r.title);
    if (!t || seen.has(t) || assigned.some((a) => a.includes(t) || t.includes(a))) continue;
    seen.add(t);
    out.push(r.title);
  }
  return out.slice(0, 12);
}
