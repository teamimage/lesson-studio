import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Assignment, LessonFull, PracticeLog, Repertoire, Student } from "@/lib/data";
import { addDays, parseISODate, todayISO, toISODate } from "@/lib/format";
import { booksFor, matchesPiece } from "@/lib/suzuki";

// Helpers for the teacher desk (/teacher): one screen per student.

/** Practice logs for the `days` days ending today, oldest first. */
export async function listPracticeRange(studentId: string, days = 28, today = todayISO()): Promise<PracticeLog[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("practice_logs")
    .select("*")
    .eq("student_id", studentId)
    .gte("practice_date", addDays(today, -(days - 1)))
    .lte("practice_date", today)
    .order("practice_date");
  return data ?? [];
}

export function practiced(log: PracticeLog | undefined): boolean {
  return !!log && ((log.minutes ?? 0) > 0 || log.completed_assignment_ids.length > 0);
}

/** How many of the logged days ticked off each assignment. */
export function assignmentCounts(assignments: Assignment[], logs: PracticeLog[]): Map<string, number> {
  const counts = new Map<string, number>(assignments.map((a) => [a.id, 0]));
  for (const log of logs) {
    for (const id of log.completed_assignment_ids) {
      if (counts.has(id)) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }
  return counts;
}

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

/**
 * The next lesson: the date the teacher set on the last lesson if it is still
 * ahead, otherwise the next occurrence of the student's usual lesson day.
 */
export function nextLesson(student: Student, latest: LessonFull | null, today = todayISO()): { date: string; source: "set" | "weekly" } | null {
  if (latest?.next_lesson_date && latest.next_lesson_date >= today) {
    return { date: latest.next_lesson_date, source: "set" };
  }
  const day = student.lesson_day?.trim().toLowerCase() ?? "";
  if (/every ?day|daily/.test(day)) return { date: today, source: "weekly" };
  const idx = WEEKDAYS.findIndex((w) => day.startsWith(w.slice(0, 3)));
  if (idx < 0) return null;
  const d = parseISODate(today);
  const ahead = (idx - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + ahead);
  return { date: toISODate(d), source: "weekly" };
}

export type BookPosition = {
  book: string;
  total: number;
  inReview: number;
  /** The first piece in the book that hasn't been started. */
  nextPiece: string | null;
  /** Current pieces (learning/polishing/preview) that belong to this book. */
  current: string[];
};

/**
 * Where the student sits in the Suzuki books: the first book that still has
 * unfinished pieces, or the book named on the profile if nothing is tracked.
 */
export function bookPosition(instrument: string, currentBook: string | null, rep: Repertoire[]): BookPosition | null {
  const books = booksFor(instrument);
  if (books.length === 0) return null;
  const rows = books.map((b) => {
    const matched = b.pieces.map((title) => ({ title, rep: rep.find((r) => matchesPiece(title, r.title)) }));
    const done = matched.filter((m) => m.rep && (m.rep.status === "review" || m.rep.status === "performed")).length;
    return { b, matched, done, touched: matched.filter((m) => m.rep).length };
  });
  const pick =
    rows.find((r) => r.touched > 0 && r.done < r.b.pieces.length) ??
    rows.find((r) => currentBook && r.b.book.toLowerCase().includes(currentBook.toLowerCase().replace(/^suzuki\s+/, ""))) ??
    rows.find((r) => r.done < r.b.pieces.length) ??
    rows[rows.length - 1];
  return {
    book: pick.b.book,
    total: pick.b.pieces.length,
    inReview: pick.done,
    nextPiece: pick.matched.find((m) => !m.rep)?.title ?? null,
    current: pick.matched
      .filter((m) => m.rep && (m.rep.status === "learning" || m.rep.status === "polishing" || m.rep.status === "preview"))
      .map((m) => m.rep!.title),
  };
}
