import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { parseGrading, parseStudentGrading, resolveGrading, type GradingConfig } from "@/lib/grading";

type Db = Awaited<ReturnType<typeof createClient>>;

/** The studio default, or null when the teacher's row can't be read (a family's phone) or grading.sql hasn't run. */
export async function studioGrading(db: Db, teacherId: string | null | undefined): Promise<GradingConfig | null> {
  if (!teacherId) return null;
  // select("*") so this still works before grading.sql adds the column.
  const { data } = await db.from("teachers").select("*").eq("id", teacherId).maybeSingle();
  const raw = (data as { grading?: unknown } | null)?.grading;
  return raw ? parseGrading(raw) : null;
}

/** Grading for a student row (selected with "*"), with the studio default when it can be read. */
export async function gradingForStudent(
  db: Db,
  student: { teacher_id?: string | null } & Record<string, unknown>,
): Promise<GradingConfig> {
  const own = parseStudentGrading(student.grading);
  if (own && !own.follows_studio) return own;
  return resolveGrading(own, await studioGrading(db, student.teacher_id));
}
