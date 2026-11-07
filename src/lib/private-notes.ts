import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

type Db = SupabaseClient<Database>;

// Teacher-only notes (lesson notes, "next time" ideas, student notes) live in
// lesson_private / student_private, which families can't read (see
// private-notes.sql). These put them back on the rows for the teacher's
// screens. For a family the private tables return nothing, so the notes stay
// empty. Until the SQL has run, the old columns are used as they are.

type LessonNotes = { id: string; teacher_notes: string | null; suggestions: string | null };
type StudentNotes = { id: string; notes: string | null };

export async function withLessonPrivate<T extends LessonNotes>(db: Db, rows: T[]): Promise<T[]> {
  if (rows.length === 0) return rows;
  const { data, error } = await db
    .from("lesson_private")
    .select("lesson_id, teacher_notes, suggestions")
    .in(
      "lesson_id",
      rows.map((r) => r.id),
    );
  if (error) return rows; // table not made yet: the columns still hold the notes
  const byId = new Map((data ?? []).map((p) => [p.lesson_id, p]));
  return rows.map((r) => {
    const p = byId.get(r.id);
    return p ? { ...r, teacher_notes: p.teacher_notes, suggestions: p.suggestions } : r;
  });
}

export async function withLessonPrivateOne<T extends LessonNotes>(db: Db, row: T | null): Promise<T | null> {
  return row ? (await withLessonPrivate(db, [row]))[0] : null;
}

export async function withStudentPrivate<T extends StudentNotes>(db: Db, rows: T[]): Promise<T[]> {
  if (rows.length === 0) return rows;
  const { data, error } = await db
    .from("student_private")
    .select("student_id, notes")
    .in(
      "student_id",
      rows.map((r) => r.id),
    );
  if (error) return rows;
  const byId = new Map((data ?? []).map((p) => [p.student_id, p]));
  return rows.map((r) => {
    const p = byId.get(r.id);
    return p ? { ...r, notes: p.notes } : r;
  });
}

export async function withStudentPrivateOne<T extends StudentNotes>(db: Db, row: T | null): Promise<T | null> {
  return row ? (await withStudentPrivate(db, [row]))[0] : null;
}
