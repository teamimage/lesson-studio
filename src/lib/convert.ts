import "server-only";
import { createClient } from "@/lib/supabase/server";
import { PRACTICE_BUCKET, RECORDINGS_BUCKET } from "@/lib/constants";
import type { Json } from "@/lib/supabase/types";
import { deleteStream } from "@/lib/stream";
import { lessonMainId } from "@/lib/main-camera";
import { writeLength } from "@/lib/lesson-length";
import { draftFromTranscript, latestTranscript } from "@/lib/ai/process-lesson";
import { parseActivity, playingSeconds } from "@/lib/practice/activity";
import { reviewConverted, unapplyFromLog } from "@/lib/practice/process";
import type { PracticeAnalysis } from "@/lib/practice/review-types";

// Switching a recording between lesson and practice, before it is confirmed.
//
// Maaike is the teacher and also practises with the children at home, so a
// recording of the two of them can be saved as the wrong kind. While a lesson
// is still a draft (not approved), or a practice session's review is in, it
// can be switched the other way:
//
//   lesson → practice  The lesson's transcript (and a sound timeline the
//                      browser works out from the recording, when it can)
//                      become a practice session on the lesson's date, which
//                      gets a practice review and goes on the practice log.
//                      The draft lesson, its videos and streaming copies are
//                      deleted, as practice recordings are once reviewed.
//   practice → lesson  The session's minutes and ticks come off the practice
//                      log, a draft lesson is made on its date and Claude
//                      drafts it from the practice transcript. The practice
//                      recording itself was already deleted after its
//                      review, so the lesson has notes but no video.

type Db = Awaited<ReturnType<typeof createClient>>;

/** Files bigger than this aren't listened through in the browser (phones run out of memory). */
export const LISTEN_MAX_BYTES = 250 * 1024 * 1024;

export type ConvertResult = { ok: true; href: string } | { ok: false; error: string };

/** The draft lesson's main recording, with a link the browser can listen through, if it's small enough. */
export async function lessonAudioForPractice(lessonId: string): Promise<{ url: string | null; tooBig: boolean }> {
  const db = await createClient();
  const rec = await mainRecording(db, lessonId);
  if (!rec) return { url: null, tooBig: false };
  if (Number(rec.size_bytes) > LISTEN_MAX_BYTES) return { url: null, tooBig: true };
  const { data } = await db.storage.from(RECORDINGS_BUCKET).createSignedUrl(rec.storage_path, 60 * 60);
  return { url: data?.signedUrl ?? null, tooBig: false };
}

async function mainRecording(db: Db, lessonId: string) {
  const [{ data: recs }, mainId] = await Promise.all([
    db.from("recordings").select("*").eq("lesson_id", lessonId).eq("status", "ready").order("created_at"),
    lessonMainId(db, lessonId),
  ]);
  const live = (recs ?? []).filter((r) => !r.archived_at);
  return live.find((r) => r.id === mainId) ?? live[0] ?? null;
}

export async function lessonToPractice(lessonId: string, rawActivity: unknown): Promise<ConvertResult> {
  const db = await createClient();
  const { data: lesson } = await db.from("lessons").select("*").eq("id", lessonId).maybeSingle();
  if (!lesson) return { ok: false, error: "That lesson wasn't found." };
  if (lesson.status !== "draft") {
    return { ok: false, error: "This lesson is already approved. Move it back to draft first, then switch it." };
  }
  const [rec, transcript, { data: allRecs }] = await Promise.all([
    mainRecording(db, lessonId),
    latestTranscript(db, lessonId),
    db.from("recordings").select("id, storage_path, stream_uid").eq("lesson_id", lessonId),
  ]);
  if (transcript && (transcript.status === "transcribing" || transcript.status === "drafting")) {
    return { ok: false, error: "The recording is still being processed. Try again in a few minutes." };
  }

  // The plan being practised: the newest approved lesson up to that day.
  const { data: plan } = await db
    .from("lessons")
    .select("id")
    .eq("student_id", lesson.student_id)
    .eq("status", "approved")
    .lte("lesson_date", lesson.lesson_date)
    .neq("id", lesson.id)
    .order("lesson_date", { ascending: false })
    .order("approved_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const activity = parseActivity(rawActivity).slice(0, 4 * 3600);
  const lastSecond = activity.length ? activity[activity.length - 1].t + 1 : 0;
  const duration = Math.round(
    Number(rec?.duration_seconds) ||
      Number(transcript?.audio_seconds) ||
      lastSecond ||
      (lesson.duration_minutes ?? 0) * 60,
  );
  const startedAt = rec?.started_at ?? rec?.created_at ?? lesson.created_at;
  const endedAt = new Date(Date.parse(startedAt) + duration * 1000).toISOString();

  const { data: session, error } = await db
    .from("practice_sessions")
    .insert({
      student_id: lesson.student_id,
      teacher_id: lesson.teacher_id,
      lesson_id: plan?.id ?? null,
      practice_date: lesson.lesson_date,
      started_at: startedAt,
      ended_at: endedAt,
      duration_seconds: duration,
      playing_seconds: playingSeconds(activity),
      media: rec && !rec.mime_type.startsWith("audio") ? "video" : "audio",
      mime_type: rec?.mime_type ?? null,
      size_bytes: rec?.size_bytes ?? null,
      activity: activity as unknown as Json,
      transcript: transcript?.transcript ?? null,
      status: "uploading",
      created_by: (await db.auth.getClaims()).data?.claims?.sub ?? null,
    })
    .select("id")
    .single();
  if (error || !session) return { ok: false, error: "Couldn't save the practice session." };

  // The wrong one goes: suggested reminders from its draft, streaming
  // copies, the original files, then the lesson (its transcript, videos,
  // pieces and assignments go with it).
  await db.from("student_reminders").delete().eq("lesson_id", lessonId).eq("status", "suggested");
  await Promise.all((allRecs ?? []).flatMap((r) => (r.stream_uid ? [deleteStream(r.stream_uid).catch(() => {})] : [])));
  const paths = (allRecs ?? []).map((r) => r.storage_path).filter(Boolean);
  if (paths.length) await db.storage.from(RECORDINGS_BUCKET).remove(paths);
  await db.from("lessons").delete().eq("id", lessonId);

  await reviewConverted(session.id);
  return { ok: true, href: `/family/${lesson.student_id}#practice-reviews` };
}

export async function practiceToLesson(sessionId: string): Promise<ConvertResult> {
  const db = await createClient();
  const { data: s } = await db.from("practice_sessions").select("*").eq("id", sessionId).maybeSingle();
  if (!s) return { ok: false, error: "That practice session wasn't found." };
  if (s.status !== "done" && s.status !== "error") {
    return { ok: false, error: "This practice is still being reviewed. Try again in a minute or two." };
  }

  // A draft lesson already on that day with nothing in it (Start lesson
  // pressed, nothing recorded) is used; otherwise a new one is made.
  const { data: sameDay } = await db
    .from("lessons")
    .select("id, status, summary, recordings(id), lesson_transcripts(id)")
    .eq("student_id", s.student_id)
    .eq("lesson_date", s.practice_date)
    .eq("status", "draft");
  const empty = (sameDay ?? []).find((l) => !l.summary && !l.recordings.length && !l.lesson_transcripts.length);
  let lessonId = empty?.id ?? null;
  const minutes = Math.max(1, Math.round(s.duration_seconds / 60));
  if (lessonId) {
    await writeLength(db, lessonId, minutes, "practice");
  } else {
    const { data: made } = await db
      .from("lessons")
      .insert({
        student_id: s.student_id,
        teacher_id: s.teacher_id,
        lesson_date: s.practice_date,
        duration_minutes: minutes,
        status: "draft",
        created_at: s.started_at,
      })
      .select("id")
      .single();
    lessonId = made?.id ?? null;
  }
  if (!lessonId) return { ok: false, error: "Couldn't make the lesson. Only the teacher's account can add lessons." };

  const transcript = s.transcript?.trim() ?? "";
  const review = s.analysis as PracticeAnalysis | null;
  if (!transcript) {
    const note = [
      `Made from a practice recording (${minutes} min). No talking was transcribed, so there's no AI draft; fill this lesson in by hand.`,
      review?.summary ? `What the practice review heard: ${review.summary}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");
    await db.from("lessons").update({ teacher_notes: note }).eq("id", lessonId);
  }

  await unapplyFromLog(db, s);
  if (s.storage_path) await db.storage.from(PRACTICE_BUCKET).remove([s.storage_path]);
  await db.from("practice_sessions").delete().eq("id", s.id);

  if (transcript) await draftFromTranscript(s.teacher_id, lessonId, transcript, s.duration_seconds);
  return { ok: true, href: `/lessons/${lessonId}?switched=1` };
}
