import "server-only";
import { createClient } from "@/lib/supabase/server";

// Add lesson (a past date) and Start lesson make the lesson record first and
// the video comes after. When no video ever arrives, an empty draft is left
// behind and shows as a lesson day on the practice calendars (Ephram's
// "lesson" on Nov 6, 2026 was one). Drafts with nothing in them that are
// over a day old are removed.

const STALE_MS = 24 * 60 * 60 * 1000;

export async function removeEmptyDraftLessons(studentId: string): Promise<void> {
  const db = await createClient();
  const before = new Date(Date.now() - STALE_MS).toISOString();
  const { data, error } = await db
    .from("lessons")
    .select(
      "id, summary, focus_points, parent_message, suggestions, teacher_notes, recordings(id), lesson_transcripts(id), lesson_pieces(id), assignments(id), stand_events(id)",
    )
    .eq("student_id", studentId)
    .eq("status", "draft")
    // updated_at, not created_at: Add lesson stamps a past lesson with its own day.
    .lt("updated_at", before);
  if (error || !data?.length) return;
  const text = (v: string | null) => !!v?.trim();
  const empty = data.filter(
    (l) =>
      !text(l.summary) &&
      !text(l.focus_points) &&
      !text(l.parent_message) &&
      !text(l.suggestions) &&
      !text(l.teacher_notes) &&
      !l.recordings.length &&
      !l.lesson_transcripts.length &&
      !l.lesson_pieces.length &&
      !l.assignments.length &&
      !l.stand_events.length,
  );
  if (!empty.length) return;
  // Teacher-only notes live in their own table; a draft with any is kept.
  const ids = empty.map((l) => l.id);
  const { data: priv, error: privError } = await db
    .from("lesson_private")
    .select("lesson_id, teacher_notes, suggestions")
    .in("lesson_id", ids);
  if (privError && privError.code !== "42P01" && privError.code !== "PGRST205") return;
  const keep = new Set((priv ?? []).filter((p) => text(p.teacher_notes) || text(p.suggestions)).map((p) => p.lesson_id));
  const gone = ids.filter((id) => !keep.has(id));
  if (gone.length) await db.from("lessons").delete().in("id", gone).eq("status", "draft");
}
