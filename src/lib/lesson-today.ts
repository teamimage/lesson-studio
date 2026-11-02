import "server-only";
import { createClient } from "@/lib/supabase/server";
import { todayISO } from "@/lib/format";

// Lessons started within this window count as "today's lesson", so the music
// stand and a video uploaded afterwards land on the same record. A time window
// rather than a date, because the server's date is UTC and lessons are not.
const SAME_LESSON_HOURS = 12;

/**
 * The lesson running for a student right now (one started in the last 12 h),
 * or null. Never creates one: only Start lesson does that.
 */
export async function findTodayLesson(studentId: string): Promise<string | null> {
  const supabase = await createClient();
  const since = new Date(Date.now() - SAME_LESSON_HOURS * 3600_000).toISOString();
  const { data: recent } = await supabase
    .from("lessons")
    .select("id")
    .eq("student_id", studentId)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return recent?.id ?? null;
}

/** Start lesson: today's lesson for a student (reused if one was started recently), or a new draft. */
export async function findOrCreateTodayLesson(studentId: string, teacherId: string): Promise<string | null> {
  const recent = await findTodayLesson(studentId);
  if (recent) return recent;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lessons")
    .insert({ student_id: studentId, teacher_id: teacherId, lesson_date: todayISO(), status: "draft" })
    .select("id")
    .single();
  return error || !data ? null : data.id;
}
