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
  return data.map((s) => ({ ...s, review: (s.analysis as PracticeAnalysis | null) ?? null, titles }));
}
