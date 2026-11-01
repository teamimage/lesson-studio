import "server-only";
import { createClient } from "@/lib/supabase/server";
import { latestTranscript, stateOf, type ProcessState } from "./process-lesson";

export type LessonAi = {
  state: ProcessState;
  transcript: string | null;
  /** What Claude drafted (moments and assignment video times live here). */
  draft: unknown;
  costUsd: number;
};

/** What the lesson page needs: processing state, transcript and AI spend. */
export async function getLessonAi(lessonId: string): Promise<LessonAi> {
  const db = await createClient();
  const [row, { data: usage }] = await Promise.all([
    latestTranscript(db, lessonId),
    db.from("ai_usage").select("cost_usd").eq("lesson_id", lessonId),
  ]);
  return {
    state: stateOf(row),
    transcript: row?.transcript ?? null,
    draft: row?.draft ?? null,
    costUsd: (usage ?? []).reduce((s, u) => s + Number(u.cost_usd), 0),
  };
}

export type MonthTotal = { month: string; costUsd: number; calls: number };
export type LessonTotal = {
  lessonId: string | null;
  lessonDate: string | null;
  studentName: string | null;
  costUsd: number;
  transcriptionUsd: number;
  claudeUsd: number;
  audioMinutes: number;
};
export type UsageSummary = {
  thisMonthUsd: number;
  allTimeUsd: number;
  months: MonthTotal[];
  lessons: LessonTotal[];
};

/** Totals for Settings: by month, and by lesson (most recent first). */
export async function getUsageSummary(teacherId: string): Promise<UsageSummary> {
  const db = await createClient();
  const { data } = await db
    .from("ai_usage")
    .select("lesson_id, kind, cost_usd, audio_seconds, created_at, lessons(lesson_date, students(name))")
    .eq("teacher_id", teacherId)
    .order("created_at", { ascending: false })
    .limit(5000);
  const rows = data ?? [];

  const months = new Map<string, MonthTotal>();
  const lessons = new Map<string, LessonTotal>();
  let allTime = 0;
  for (const r of rows) {
    const cost = Number(r.cost_usd) || 0;
    allTime += cost;
    const month = r.created_at.slice(0, 7);
    const m = months.get(month) ?? { month, costUsd: 0, calls: 0 };
    m.costUsd += cost;
    m.calls += 1;
    months.set(month, m);

    const key = r.lesson_id ?? "deleted";
    const l =
      lessons.get(key) ??
      ({
        lessonId: r.lesson_id,
        lessonDate: r.lessons?.lesson_date ?? null,
        studentName: r.lessons?.students?.name ?? null,
        costUsd: 0,
        transcriptionUsd: 0,
        claudeUsd: 0,
        audioMinutes: 0,
      } satisfies LessonTotal);
    l.costUsd += cost;
    if (r.kind === "transcription") {
      l.transcriptionUsd += cost;
      l.audioMinutes += (Number(r.audio_seconds) || 0) / 60;
    } else {
      l.claudeUsd += cost;
    }
    lessons.set(key, l);
  }
  const thisMonth = new Date().toISOString().slice(0, 7);
  return {
    thisMonthUsd: months.get(thisMonth)?.costUsd ?? 0,
    allTimeUsd: allTime,
    months: [...months.values()],
    lessons: [...lessons.values()],
  };
}
