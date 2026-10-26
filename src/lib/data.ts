import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/types";
import { addDays, daysBetween, todayISO } from "@/lib/format";

export type Student = Tables<"students">;
export type Lesson = Tables<"lessons">;
export type LessonPiece = Tables<"lesson_pieces">;
export type Assignment = Tables<"assignments">;
export type PracticeLog = Tables<"practice_logs">;
export type Repertoire = Tables<"repertoire">;
export type Parent = Tables<"parents">;

export type LessonFull = Lesson & {
  lesson_pieces: LessonPiece[];
  assignments: Assignment[];
};

export type PracticeWeek = {
  /** ISO dates of the 7 days ending today, oldest first. */
  days: string[];
  logs: PracticeLog[];
  daysPracticed: number;
  daysListened: number;
  totalMinutes: number;
  notes: PracticeLog[];
};

export async function listStudents(): Promise<Student[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("students")
    .select("*")
    .order("active", { ascending: false })
    .order("name");
  return data ?? [];
}

export async function getStudent(id: string): Promise<Student | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("students").select("*").eq("id", id).maybeSingle();
  return data;
}

export async function listLessons(studentId: string, limit = 50): Promise<LessonFull[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("lessons")
    .select("*, lesson_pieces(*), assignments(*)")
    .eq("student_id", studentId)
    .order("lesson_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []).map(sortLesson);
}

export async function getLesson(id: string): Promise<LessonFull | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("lessons")
    .select("*, lesson_pieces(*), assignments(*)")
    .eq("id", id)
    .maybeSingle();
  return data ? sortLesson(data) : null;
}

/** The most recent approved lesson, which is what the parent practices from. */
export async function getCurrentPlan(studentId: string): Promise<LessonFull | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("lessons")
    .select("*, lesson_pieces(*), assignments(*)")
    .eq("student_id", studentId)
    .eq("status", "approved")
    .order("lesson_date", { ascending: false })
    .order("approved_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? sortLesson(data) : null;
}

/** Latest lesson of any status (for the teacher's dashboard). */
export async function getLatestLesson(studentId: string): Promise<LessonFull | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("lessons")
    .select("*, lesson_pieces(*), assignments(*)")
    .eq("student_id", studentId)
    .order("lesson_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? sortLesson(data) : null;
}

export async function listDraftLessons(): Promise<(Lesson & { students: Pick<Student, "name" | "instrument"> | null })[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("lessons")
    .select("*, students(name, instrument)")
    .eq("status", "draft")
    .order("lesson_date", { ascending: false });
  return data ?? [];
}

export async function getPracticeWeek(studentId: string, today = todayISO()): Promise<PracticeWeek> {
  const supabase = await createClient();
  const start = addDays(today, -6);
  const { data } = await supabase
    .from("practice_logs")
    .select("*")
    .eq("student_id", studentId)
    .gte("practice_date", start)
    .lte("practice_date", today)
    .order("practice_date");
  const logs = data ?? [];
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const practiced = logs.filter((l) => (l.minutes ?? 0) > 0 || l.completed_assignment_ids.length > 0);
  return {
    days,
    logs,
    daysPracticed: practiced.length,
    daysListened: logs.filter((l) => l.listened).length,
    totalMinutes: logs.reduce((n, l) => n + (l.minutes ?? 0), 0),
    notes: logs.filter((l) => l.parent_note?.trim()),
  };
}

export async function listPracticeLogs(studentId: string, limit = 60): Promise<PracticeLog[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("practice_logs")
    .select("*")
    .eq("student_id", studentId)
    .order("practice_date", { ascending: false })
    .limit(limit);
  return data ?? [];
}

export async function getPracticeLog(studentId: string, date: string): Promise<PracticeLog | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("practice_logs")
    .select("*")
    .eq("student_id", studentId)
    .eq("practice_date", date)
    .maybeSingle();
  return data;
}

export async function listRepertoire(studentId: string): Promise<Repertoire[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("repertoire")
    .select("*")
    .eq("student_id", studentId)
    .order("status")
    .order("started_on", { ascending: false });
  return data ?? [];
}

/** Review pieces that haven't been played in a while. */
export function staleReview(rep: Repertoire[], today = todayISO(), days = 14): (Repertoire & { daysSince: number | null })[] {
  return rep
    .filter((r) => r.status === "review" || r.status === "polishing")
    .map((r) => ({
      ...r,
      daysSince: r.last_played_on ? daysBetween(r.last_played_on, today) : null,
    }))
    .filter((r) => r.daysSince === null || r.daysSince >= days)
    .sort((a, b) => (b.daysSince ?? 999) - (a.daysSince ?? 999));
}

export async function listParentsForStudent(studentId: string): Promise<Parent[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("student_parents")
    .select("parents(*)")
    .eq("student_id", studentId);
  return (data ?? []).map((r) => r.parents).filter((p): p is Parent => !!p);
}

export async function getTeacherForStudent(student: Student): Promise<Tables<"teachers"> | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("teachers").select("*").eq("id", student.teacher_id).maybeSingle();
  return data;
}

function sortLesson<T extends { lesson_pieces: LessonPiece[]; assignments: Assignment[] }>(l: T): T {
  return {
    ...l,
    lesson_pieces: [...l.lesson_pieces].sort((a, b) => a.sort_order - b.sort_order),
    assignments: [...l.assignments].sort((a, b) => a.sort_order - b.sort_order),
  };
}
