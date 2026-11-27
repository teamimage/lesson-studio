import "server-only";
import { guestOf } from "@/lib/guest";
import { createClient } from "@/lib/supabase/server";
import { addDays, daysBetween, todayISO } from "@/lib/format";
import { type Program, programBySlug } from "./content";
import { type LessonHabits, average, habitValue, lessonHabits } from "./metrics";

export type HabitLesson = {
  lessonId: string;
  date: string;
  student: string;
  habits: LessonHabits;
  /** Questions per 10 minutes, when the recording length is known. */
  questionsPer10: number | null;
};

export type Run = {
  id: string;
  program: Program;
  startedOn: string;
  lengthDays: number;
  /** 1-based day today; can pass lengthDays when the program has ended. */
  day: number;
  finished: boolean;
  checkins: Record<number, "yes" | "partly" | "no">;
};

export type Measure = {
  /** Average over the 3 recorded lessons before the start. */
  baseline: number | null;
  baselineLessons: number;
  /** Average over recorded lessons since the start. */
  during: number | null;
  duringLessons: number;
};

export type CraftState = {
  /** False until admin/craft.sql has been run. */
  ready: boolean;
  run: Run | null;
  lessons: HabitLesson[];
  measure: Measure | null;
};

/** Fewer recorded lessons than this and a change is not called measured. */
export const MIN_LESSONS = 3;

export async function loadRunningRun(teacherId: string): Promise<{ ready: boolean; run: Run | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("craft_runs")
    .select("id, program, started_on, length_days, ended_on")
    .eq("teacher_id", teacherId)
    .is("ended_on", null)
    .maybeSingle();
  if (error) return { ready: false, run: null };
  if (!data) return { ready: true, run: null };
  const program = programBySlug(data.program);
  if (!program) return { ready: true, run: null };

  const { data: checks } = await supabase.from("craft_checkins").select("day, answer").eq("run_id", data.id);
  const checkins: Run["checkins"] = {};
  for (const c of checks ?? []) {
    if (c.answer === "yes" || c.answer === "partly" || c.answer === "no") checkins[c.day] = c.answer;
  }
  const day = daysBetween(data.started_on, todayISO()) + 1;
  return {
    ready: true,
    run: {
      id: data.id,
      program,
      startedOn: data.started_on,
      lengthDays: data.length_days,
      day,
      finished: day > data.length_days,
      checkins,
    },
  };
}

/** Recorded lessons with a transcript, newest first. */
export async function loadHabitLessons(teacherId: string, limit = 40): Promise<HabitLesson[]> {
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("lesson_transcripts")
    .select("lesson_id, transcript, audio_seconds")
    .eq("teacher_id", teacherId)
    .not("transcript", "is", null)
    .order("created_at", { ascending: false })
    .limit(limit * 2);
  // A lesson filmed from two angles has two transcripts: keep the longer.
  const best = new Map<string, { transcript: string; seconds: number | null }>();
  for (const r of rows ?? []) {
    const t = r.transcript ?? "";
    const prev = best.get(r.lesson_id);
    if (!prev || t.length > prev.transcript.length) best.set(r.lesson_id, { transcript: t, seconds: r.audio_seconds });
  }
  if (!best.size) return [];

  const { data: lessons } = await supabase
    .from("lessons")
    // "*" so this still works before guest-teacher.sql adds guest_teacher.
    .select("*, students(name)")
    .in("id", [...best.keys()]);
  const out: HabitLesson[] = [];
  for (const l of lessons ?? []) {
    // A guest taught it: their habits aren't this teacher's.
    if (guestOf(l)) continue;
    const t = best.get(l.id);
    const habits = lessonHabits(t?.transcript);
    if (!t || !habits || habits.words < 200) continue;
    const s = l.students as { name: string } | { name: string }[] | null;
    const name = (Array.isArray(s) ? s[0]?.name : s?.name) ?? "";
    out.push({
      lessonId: l.id,
      date: l.lesson_date,
      student: name.trim().split(/\s+/)[0] || name,
      habits,
      questionsPer10: t.seconds && t.seconds >= 300 ? (habits.questions / t.seconds) * 600 : null,
    });
  }
  out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return out.slice(0, limit);
}

export function measureRun(run: Run, lessons: HabitLesson[]): Measure {
  const end = addDays(run.startedOn, run.lengthDays - 1);
  const value = (l: HabitLesson) => habitValue(l.habits, run.program.metric);
  const before = lessons.filter((l) => l.date < run.startedOn && value(l) != null).slice(0, 3);
  const during = lessons.filter((l) => l.date >= run.startedOn && l.date <= end && value(l) != null);
  return {
    baseline: average(before.map((l) => value(l)!)),
    baselineLessons: before.length,
    during: average(during.map((l) => value(l)!)),
    duringLessons: during.length,
  };
}

export async function loadCraft(teacherId: string): Promise<CraftState> {
  const [{ ready, run }, lessons] = await Promise.all([loadRunningRun(teacherId), loadHabitLessons(teacherId)]);
  return { ready, run, lessons, measure: run ? measureRun(run, lessons) : null };
}
