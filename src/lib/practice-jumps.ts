import "server-only";
import { createClient } from "@/lib/supabase/server";
import { latestTranscript } from "@/lib/ai/process-lesson";
import { formatDate } from "@/lib/format";
import { listLessons, type Assignment, type LessonFull } from "@/lib/data";
import {
  listRecordingsForLesson,
  type RecordingWithUrl,
} from "@/lib/recordings";
import { listStandEvents, type listScores } from "@/lib/scores";
import { parseMusicLinks } from "@/lib/music-links";
import {
  assignmentJumps,
  buildMoments,
  draftAssignmentTimes,
  lessonAiMoments,
  withClipInfo,
  words,
  type Jump,
  type Moment,
} from "@/lib/lesson-moments";

type Scores = Awaited<ReturnType<typeof listScores>>;

/** A practice item's spot in a lesson video, and which lesson it is from. */
export type PracticeJump = Jump & { lessonDate: string; earlier: boolean };

// How many lessons before the current one to look through for items the
// current lesson's video doesn't cover (review pieces, carried-over scales).
const LOOK_BACK = 4;

/**
 * For each practice item of the current plan, where it was last worked on in
 * a lesson video: the current lesson first (the AI's time for that
 * assignment, else a matching stand piece or AI moment), then earlier
 * approved lessons, newest first. Also returns every video those jumps use,
 * for the popup player. Families only get the streaming copy.
 *
 * Nothing is stored: it is the same text matching the lesson page does, no
 * AI call, so it is cheap to work out on each view.
 */
export async function practiceJumps(
  plan: LessonFull,
  scores: Scores,
): Promise<{
  jumps: Record<string, PracticeJump>;
  recordings: RecordingWithUrl[];
}> {
  const jumps: Record<string, PracticeJump> = {};
  const recordings: RecordingWithUrl[] = [];
  const want = () => plan.assignments.filter((a) => !jumps[a.id]);

  const fromLesson = async (lesson: LessonFull, earlier: boolean) => {
    const items = want();
    if (!items.length) return;
    const recs = (
      await listRecordingsForLesson(lesson.id, "until-stream")
    ).filter((r) => r.url || r.streamReady);
    if (!recs.length) return;
    const found = await lessonJumps(lesson, recs, scores, items);
    let used = false;
    for (const a of items) {
      const j = found[a.id];
      if (!j) continue;
      used = true;
      const date = formatDate(lesson.lesson_date, "short");
      jumps[a.id] = {
        ...j,
        label: earlier ? `${a.title} (lesson ${date})` : a.title,
        summary: earlier
          ? [`From the lesson on ${date}.`, ...(j.summary ?? [])]
          : j.summary,
        lessonDate: lesson.lesson_date,
        earlier,
      };
    }
    if (used) recordings.push(...recs);
  };

  await fromLesson(plan, false);
  if (want().length) {
    const earlier = (await listLessons(plan.student_id, 20))
      .filter(
        (l) =>
          l.status === "approved" &&
          l.id !== plan.id &&
          l.lesson_date <= plan.lesson_date,
      )
      .slice(0, LOOK_BACK);
    for (const l of earlier) {
      if (!want().length) break;
      await fromLesson(l, true);
    }
  }
  return { jumps, recordings };
}

/** Jumps for `items` (the plan's assignments) inside one lesson's videos. */
async function lessonJumps(
  lesson: LessonFull,
  recs: RecordingWithUrl[],
  scores: Scores,
  items: Assignment[],
): Promise<Record<string, Jump>> {
  const db = await createClient();
  const [events, transcript] = await Promise.all([
    listStandEvents(lesson.id),
    latestTranscript(db, lesson.id),
  ]);
  const draft = transcript?.draft ?? null;
  const aiRecording = recs.some((r) => r.id === transcript?.recording_id)
    ? transcript!.recording_id
    : null;
  const moments: Moment[] = buildMoments({
    recordings: recs.map((r) => ({
      id: r.id,
      startedAt: r.started_at,
      durationSeconds: r.duration_seconds ? Number(r.duration_seconds) : null,
    })),
    events,
    scoreTitles: Object.fromEntries(scores.map((s) => [s.id, s.title])),
    scoreSections: Object.fromEntries(scores.map((s) => [s.id, s.sections])),
    ai: aiRecording
      ? {
          recordingId: aiRecording,
          moments: lessonAiMoments(draft, lesson.teacher_notes),
        }
      : null,
    musicLinks: parseMusicLinks(draft)?.links ?? [],
  });
  const ai = aiRecording
    ? { recordingId: aiRecording, times: draftAssignmentTimes(draft) }
    : null;

  // That lesson's own assignments and where each was worked on.
  const own = withClipInfo(
    moments,
    assignmentJumps(lesson.assignments, moments, ai),
    lesson.assignments,
    lesson.lesson_pieces,
  ).jumps;
  // The plan's items straight against that lesson's moments (for items the
  // lesson didn't assign but did play, like a review piece).
  const direct = withClipInfo(
    moments,
    assignmentJumps(items, moments, null),
    items,
    lesson.lesson_pieces,
  ).jumps;

  const out: Record<string, Jump> = {};
  for (const a of items) {
    // Same assignment in that lesson (the current lesson, or carried over).
    const same = lesson.assignments.find(
      (b) => b.id === a.id || overlap(a.title, b.title) >= 0.6,
    );
    const j = (same && own[same.id]) || direct[a.id];
    if (j) out[a.id] = { ...j, summary: a.how ? [a.how] : j.summary };
  }
  return out;
}

/** Share of `a`'s words that `b` also has. */
function overlap(a: string, b: string): number {
  const want = words(a);
  if (!want.length) return 0;
  const have = new Set(words(b));
  return want.filter((w) => have.has(w)).length / want.length;
}
