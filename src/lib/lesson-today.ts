import "server-only";
import { createClient } from "@/lib/supabase/server";
import { todayISO } from "@/lib/format";

// Lessons started within this window count as "today's lesson", so the music
// stand and a video uploaded afterwards land on the same record. A time window
// rather than a date, because the server's date is UTC and lessons are not.
const SAME_LESSON_HOURS = 12;

/** Today's lesson for a student (reused if one was started recently), or a new draft. */
export async function findOrCreateTodayLesson(studentId: string, teacherId: string): Promise<string | null> {
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
  if (recent) return recent.id;
  const { data, error } = await supabase
    .from("lessons")
    .insert({ student_id: studentId, teacher_id: teacherId, lesson_date: todayISO(), status: "draft" })
    .select("id")
    .single();
  return error || !data ? null : data.id;
}
