import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { PracticeAnalysis } from "@/lib/ai/analyze-practice";
import type { PracticeSession } from "./process";

export type PracticeSessionView = PracticeSession & {
  review: PracticeAnalysis | null;
  /** Assignment titles by id, for the items in the review. */
  titles: Record<string, string>;
};

/** Recent practice sessions for a student, newest first, with assignment titles. */
export async function listPracticeSessions(studentId: string, limit = 10): Promise<PracticeSessionView[]> {
  const db = await createClient();
  const { data, error } = await db
    .from("practice_sessions")
    .select("*")
    .eq("student_id", studentId)
    .order("started_at", { ascending: false })
    .limit(limit);
  // Before practice-sessions.sql has run the table doesn't exist; show nothing.
  if (error || !data?.length) return [];

  const lessonIds = [...new Set(data.map((s) => s.lesson_id).filter((x): x is string => !!x))];
  const { data: assignments } = lessonIds.length
    ? await db.from("assignments").select("id, title").in("lesson_id", lessonIds)
    : { data: [] as { id: string; title: string }[] };
  const titles = Object.fromEntries((assignments ?? []).map((a) => [a.id, a.title]));
  // The sound timeline is large (fine pitch readings) and pages don't show it.
  return data.map((s) => ({ ...s, activity: null, review: (s.analysis as PracticeAnalysis | null) ?? null, titles }));
}

/** One recorded session, trimmed for the practice chart's day popup. */
export type DaySession = {
  id: string;
  started_at: string;
  duration_seconds: number;
  playing_seconds: number;
  media: string;
  status: string;
  counted: boolean | null;
  review: PracticeAnalysis | null;
  /** Start/Stop was pressed but the recording never uploaded. */
  recording_missing: boolean;
};

/** Everything the practice chart's popup shows for one day. */
export type PracticeDay = {
  date: string;
  minutes: number;
  listened: boolean;
  /** Titles of the items ticked off that day (by hand or by a review). */
  ticked: string[];
  parentNote: string | null;
  sessions: DaySession[];
  /** Some session that day was logged without its recording. */
  noRecording: boolean;
  /** Assignment titles by id, for the items in the reviews. */
  titles: Record<string, string>;
};

/**
 * Practice logs and recorded sessions for each day from `from` to `to`
 * (inclusive), keyed by date. Days with nothing logged are left out.
 */
export async function listPracticeDays(studentId: string, from: string, to: string): Promise<Record<string, PracticeDay>> {
  const db = await createClient();
  const [{ data: logs }, { data: sessions }] = await Promise.all([
    db
      .from("practice_logs")
      .select("practice_date, minutes, listened, completed_assignment_ids, parent_note")
      .eq("student_id", studentId)
      .gte("practice_date", from)
      .lte("practice_date", to),
    db
      .from("practice_sessions")
      // "*" rather than a column list, so this still works before
      // practice-upload-fix.sql adds recording_missing.
      .select("*")
      .eq("student_id", studentId)
      .gte("practice_date", from)
      .lte("practice_date", to)
      .order("started_at"),
  ]);

  const ids = new Set<string>();
  for (const l of logs ?? []) for (const a of l.completed_assignment_ids) ids.add(a);
  for (const s of sessions ?? []) for (const it of (s.analysis as PracticeAnalysis | null)?.items ?? []) ids.add(it.assignment_id);
  const { data: assignments } = ids.size
    ? await db.from("assignments").select("id, title").in("id", [...ids])
    : { data: [] as { id: string; title: string }[] };
  const titles: Record<string, string> = Object.fromEntries((assignments ?? []).map((a) => [a.id, a.title]));

  const days: Record<string, PracticeDay> = {};
  const day = (date: string) =>
    (days[date] ??= { date, minutes: 0, listened: false, ticked: [], parentNote: null, sessions: [], noRecording: false, titles });
  for (const l of logs ?? []) {
    const d = day(l.practice_date);
    d.minutes = l.minutes ?? 0;
    d.listened = !!l.listened;
    d.ticked = l.completed_assignment_ids.map((a) => titles[a]).filter((t): t is string => !!t);
    d.parentNote = l.parent_note?.trim() || null;
  }
  for (const s of sessions ?? []) {
    // Uploads that never finished have nothing to show.
    if (s.status === "uploading") continue;
    const missing = !!(s as { recording_missing?: boolean }).recording_missing;
    if (missing) day(s.practice_date).noRecording = true;
    day(s.practice_date).sessions.push({
      id: s.id,
      started_at: s.started_at,
      duration_seconds: s.duration_seconds,
      playing_seconds: s.playing_seconds,
      media: s.media,
      status: s.status,
      counted: s.counted,
      review: (s.analysis as PracticeAnalysis | null) ?? null,
      recording_missing: missing,
    });
  }
  return days;
}
