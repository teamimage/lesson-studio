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

// A lesson still counts as "in lesson now" only until it is ended, and never
// for longer than this, so one left open by mistake drops off by itself.
const RUNNING_MAX_HOURS = 3;

/**
 * The lesson in progress for a student: started in the last 3 hours, still a
 * draft, and not ended yet. End lesson (lesson card or music stand) writes the
 * lesson's length, and so does a video or a typed length, so a lesson with a
 * length is over. Used by Downbeat and the Today screen for "In lesson now".
 */
export async function findRunningLesson(studentId: string): Promise<string | null> {
  const supabase = await createClient();
  const since = new Date(Date.now() - RUNNING_MAX_HOURS * 3600_000).toISOString();
  const { data: recent } = await supabase
    .from("lessons")
    .select("id, status, duration_minutes")
    .eq("student_id", studentId)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!recent || recent.status !== "draft" || recent.duration_minutes != null) return null;
  return recent.id;
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
