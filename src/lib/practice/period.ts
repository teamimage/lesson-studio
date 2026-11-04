import "server-only";
import { createClient } from "@/lib/supabase/server";
import { addDays, daysBetween, formatDate, parseISODate, todayISO } from "@/lib/format";
import type { Json, Tables } from "@/lib/supabase/types";
import { listLessonDates } from "@/lib/data";
import { analyzePeriod } from "@/lib/ai/analyze-period";
import { DraftError } from "@/lib/ai/draft-lesson";
import { MissingKeyError } from "@/lib/ai/assemblyai";
import { claudeCost, type ClaudeUsage } from "@/lib/ai/pricing";
import type { PracticeAnalysis, PeriodReview } from "./review-types";
import type { PracticeSessionView } from "./data";
import { scaleLine } from "./scales";
import { INTONATION_VERSION, tendencyText, verdictText } from "./intonation";
import { regradeIntonation } from "./regrade";

// Practice reviews from one lesson to the next.
//
// A period starts on a lesson day and runs to the day before the next lesson
// (a week, two weeks, whatever the gap was), never calendar weeks. Practice
// on a lesson day counts toward the new period. Practice before a student's
// first lesson forms one period of its own. The current period is open: it
// runs through today until the next lesson is started or recorded.
//
// Everything countable (days, minutes, check marks per day) is worked out
// live from practice_logs and practice_sessions. Claude's written part is
// stored in practice_weeks (the table name predates this change), keyed by
// the period's first day in week_start. A finished period gets it
// automatically when the next lesson opens or the period is first viewed
// after it; the open period can be written "so far" on request.

type Db = Awaited<ReturnType<typeof createClient>>;
type Log = Tables<"practice_logs">;
export type PracticePeriodRow = Tables<"practice_weeks">;

const STALE_MS = 5 * 60 * 1000;
/** How far back to look for practice before a student's first lesson. */
const PRE_LESSON_DAYS = 60;

export type PeriodBounds = {
  start: string;
  /** Last day of the period: the day before the next lesson, or today for the open one. */
  end: string;
  isCurrent: boolean;
  /** False for practice before the first lesson. */
  startsWithLesson: boolean;
  /** The lesson that closes it, if any. */
  nextLesson: string | null;
  /** Start of the period before, for comparison. */
  prevStart: string | null;
};

/** The period containing `day`, given the student's lesson dates (oldest first). */
export function periodAt(lessonDates: string[], day: string, today = todayISO()): PeriodBounds | null {
  if (day > today) return null;
  const dates = lessonDates.filter((d) => d <= today);
  const before = dates.filter((d) => d <= day);
  const opener = before[before.length - 1] ?? null;
  const start = opener ?? day;
  const nextLesson = dates.find((d) => d > start) ?? null;
  return {
    start,
    end: nextLesson ? addDays(nextLesson, -1) : today,
    isCurrent: !nextLesson,
    startsWithLesson: !!opener,
    nextLesson,
    prevStart: opener ? (before[before.length - 2] ?? null) : null,
  };
}

function short(iso: string, withYear = false): string {
  const d = parseISODate(iso);
  return d.toLocaleDateString("en-US", withYear ? { month: "short", day: "numeric", year: "numeric" } : { month: "short", day: "numeric" });
}

/** A short name for a period: "Since the Nov 3 lesson", "Oct 27 to Nov 3 lessons". */
export function periodLabel(p: Pick<PeriodBounds, "start" | "isCurrent" | "startsWithLesson" | "nextLesson">): string {
  if (p.isCurrent) return p.startsWithLesson ? `Since the ${short(p.start)} lesson` : `Since ${short(p.start)}`;
  if (!p.startsWithLesson) return `Before the ${short(p.nextLesson!)} lesson`;
  return `${short(p.start)} to ${short(p.nextLesson!)} lessons`;
}

export type PeriodStats = {
  daysPracticed: number;
  /** Days in the period (so far, for the open one). */
  dayCount: number;
  totalMinutes: number;
  sessions: number;
  playingMinutes: number;
};

function practiced(l: Log): boolean {
  return (l.minutes ?? 0) > 0 || l.completed_assignment_ids.length > 0;
}

function statsOf(logs: Log[], sessions: Tables<"practice_sessions">[], dayCount: number): PeriodStats {
  const counted = sessions.filter((s) => s.status === "done" && s.counted !== false);
  return {
    daysPracticed: logs.filter(practiced).length,
    dayCount,
    totalMinutes: logs.reduce((n, l) => n + (l.minutes ?? 0), 0),
    sessions: counted.length,
    playingMinutes: Math.round(counted.reduce((n, s) => n + s.playing_seconds, 0) / 60),
  };
}

export type CheckGridRow = {
  key: string;
  title: string;
  kind: string | null;
  /** Dates in the period this item was ticked or heard. */
  days: string[];
};

export type PeriodData = PeriodBounds & {
  studentId: string;
  /** Last day counted so far: the end for a finished period, today for the open one. */
  through: string;
  days: string[];
  logs: Log[];
  sessions: PracticeSessionView[];
  lessons: { id: string; lesson_date: string; focus_points: string | null }[];
  assigned: CheckGridRow[];
  current: CheckGridRow[];
  stats: PeriodStats;
  prevStats: PeriodStats | null;
  hasActivity: boolean;
  row: PracticePeriodRow | null;
  review: PeriodReview | null;
  /** Written through the whole period (or through today, for the open one). */
  reviewUpToDate: boolean;
  /** Start writing the review as soon as the page opens. */
  autoWrite: boolean;
};

async function loadRow(db: Db, studentId: string, start: string): Promise<PracticePeriodRow | null> {
  const { data, error } = await db
    .from("practice_weeks")
    .select("*")
    .eq("student_id", studentId)
    .eq("week_start", start)
    .maybeSingle();
  // Before practice-weeks.sql has run the table doesn't exist.
  if (error) return null;
  return data;
}

export async function getPeriod(studentId: string, day: string, today = todayISO()): Promise<PeriodData | null> {
  const db = await createClient();
  const lessonDates = await listLessonDates(studentId, today);
  const b = periodAt(lessonDates, day, today);
  if (!b) return null;
  const { start, end, isCurrent, prevStart } = b;
  const through = end;
  const from = prevStart ?? start;

  const [{ data: logsAll }, { data: sessAll }, { data: lessonsRaw }, { data: repertoire }, row] = await Promise.all([
    db
      .from("practice_logs")
      .select("*")
      .eq("student_id", studentId)
      .gte("practice_date", from)
      .lte("practice_date", end)
      .order("practice_date"),
    db
      .from("practice_sessions")
      .select("*")
      .eq("student_id", studentId)
      .gte("practice_date", from)
      .lte("practice_date", end)
      .order("started_at"),
    db
      .from("lessons")
      .select("id, lesson_date, focus_points, assignments(id, title, kind, sort_order)")
      .eq("student_id", studentId)
      .eq("status", "approved")
      .lte("lesson_date", start)
      .order("lesson_date", { ascending: false })
      .limit(6),
    db.from("repertoire").select("title, status").eq("student_id", studentId),
    loadRow(db, studentId, start),
  ]);

  const logs = (logsAll ?? []).filter((l) => l.practice_date >= start);
  const prevLogs = (logsAll ?? []).filter((l) => l.practice_date < start);
  const sessRows = await regradeIntonation(db, sessAll ?? []);
  const periodSess = sessRows.filter((s) => s.practice_date >= start);
  const prevSess = sessRows.filter((s) => s.practice_date < start);

  // The plan in force: the approved lesson(s) on the opening day, or the
  // latest approved one before it if that lesson isn't approved yet.
  const lessonsDesc = lessonsRaw ?? [];
  const planDate = lessonsDesc[0]?.lesson_date;
  const lessons = lessonsDesc.filter((l) => l.lesson_date === planDate);

  const titles: Record<string, string> = {};
  for (const l of lessonsDesc) for (const a of l.assignments) titles[a.id] = a.title;
  // Sessions may point at an older lesson's assignments.
  const missing = [
    ...new Set(
      periodSess.flatMap((s) => ((s.analysis as PracticeAnalysis | null)?.items ?? []).map((i) => i.assignment_id)),
    ),
  ].filter((id) => !titles[id]);
  if (missing.length) {
    const { data } = await db.from("assignments").select("id, title").in("id", missing);
    for (const a of data ?? []) titles[a.id] = a.title;
  }

  const sessions: PracticeSessionView[] = periodSess.map((s) => ({
    ...s,
    activity: null,
    review: (s.analysis as PracticeAnalysis | null) ?? null,
    titles,
  }));

  // Check marks per day: ticks in the practice log (from sessions or by hand).
  const assigned: CheckGridRow[] = [];
  const seen = new Set<string>();
  for (const l of lessons) {
    for (const a of l.assignments.slice().sort((x, y) => x.sort_order - y.sort_order)) {
      if (seen.has(a.id)) continue;
      seen.add(a.id);
      assigned.push({
        key: a.id,
        title: a.title,
        kind: a.kind,
        days: logs.filter((g) => g.completed_assignment_ids.includes(a.id)).map((g) => g.practice_date),
      });
    }
  }

  // Current pieces: heard in a recorded session that day.
  const assignedTitles = assigned.map((r) => norm(r.title));
  const current: CheckGridRow[] = [];
  const currentSeen = new Set<string>();
  const addCurrent = (title: string) => {
    const t = norm(title);
    if (!t || currentSeen.has(t) || assignedTitles.some((a) => a.includes(t) || t.includes(a))) return;
    currentSeen.add(t);
    current.push({
      key: `rep-${t}`,
      title,
      kind: null,
      days: [
        ...new Set(
          sessions
            .filter((s) => s.review?.repertoire?.some((p) => p.practiced && norm(p.title) === t))
            .map((s) => s.practice_date),
        ),
      ],
    });
  };
  for (const r of repertoire ?? []) if (["learning", "polishing", "review"].includes(r.status)) addCurrent(r.title);

  const dayCount = daysBetween(start, through) + 1;
  const stats = statsOf(logs, periodSess, dayCount);
  const prevStats = prevStart ? statsOf(prevLogs, prevSess, daysBetween(prevStart, start)) : null;
  const hasActivity = stats.daysPracticed > 0 || stats.sessions > 0;
  const review = row?.status !== "generating" && row?.review ? (row.review as unknown as PeriodReview) : null;
  const reviewUpToDate =
    !!review && row?.through_date === through && row.session_count >= stats.sessions;
  const generatingFresh = row?.status === "generating" && Date.now() - Date.parse(row.updated_at) < STALE_MS;
  const autoWrite = !isCurrent && hasActivity && !reviewUpToDate && row?.status !== "error" && !generatingFresh;

  return {
    ...b,
    studentId,
    through,
    days: Array.from({ length: dayCount }, (_, i) => addDays(start, i)),
    logs,
    sessions,
    lessons: lessons.map((l) => ({ id: l.id, lesson_date: l.lesson_date, focus_points: l.focus_points })),
    assigned,
    current,
    stats,
    prevStats,
    hasActivity,
    row,
    review,
    reviewUpToDate,
    autoWrite,
  };
}

function norm(t: string) {
  return t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export type PeriodListItem = PeriodBounds & {
  daysPracticed: number;
  dayCount: number;
  totalMinutes: number;
  sessions: number;
  encouragement: string | null;
  needsWriting: boolean;
};

/** The open period and recent finished ones with any practice, newest first. */
export async function listPeriods(studentId: string, count = 8, today = todayISO()): Promise<PeriodListItem[]> {
  const db = await createClient();
  const lessonDates = await listLessonDates(studentId, today);
  // Opening days, newest first: recent lessons, then practice before the first lesson.
  const recent = lessonDates.slice(-count).reverse();
  const reachesFirst = recent.length === lessonDates.length;
  const firstLesson = lessonDates[0];
  const from = !reachesFirst
    ? recent[recent.length - 1]
    : addDays(firstLesson ?? today, -PRE_LESSON_DAYS);

  const [{ data: logs }, { data: sessions }, { data: rows }] = await Promise.all([
    db.from("practice_logs").select("*").eq("student_id", studentId).gte("practice_date", from),
    db
      .from("practice_sessions")
      .select("practice_date, status, counted")
      .eq("student_id", studentId)
      .gte("practice_date", from),
    db.from("practice_weeks").select("*").eq("student_id", studentId).gte("week_start", from),
  ]);

  const starts = [...recent];
  if (reachesFirst) {
    // Practice logged before the first lesson (or with no lesson yet) is its own period.
    const early = [
      ...(logs ?? []).filter(practiced).map((l) => l.practice_date),
      ...(sessions ?? []).filter((s) => s.status === "done" && s.counted !== false).map((s) => s.practice_date),
    ]
      .filter((d) => !firstLesson || d < firstLesson)
      .sort()[0];
    if (early) starts.push(early);
  }

  const out: PeriodListItem[] = [];
  for (const s of starts) {
    const b = periodAt(lessonDates, s, today);
    if (!b) continue;
    const inPeriod = (d: string) => d >= b.start && d <= b.end;
    const l = (logs ?? []).filter((g) => inPeriod(g.practice_date));
    const ss = (sessions ?? []).filter((x) => inPeriod(x.practice_date) && x.status === "done" && x.counted !== false);
    const daysPracticed = l.filter(practiced).length;
    if (!b.isCurrent && daysPracticed === 0 && ss.length === 0) continue;
    const row = (rows ?? []).find((r) => r.week_start === b.start);
    const review = row?.review ? (row.review as unknown as PeriodReview) : null;
    out.push({
      ...b,
      daysPracticed,
      dayCount: daysBetween(b.start, b.end) + 1,
      totalMinutes: l.reduce((n, g) => n + (g.minutes ?? 0), 0),
      sessions: ss.length,
      encouragement: review?.encouragement || null,
      needsWriting:
        !b.isCurrent &&
        (!row || (row.status === "done" && (row.through_date !== b.end || row.session_count < ss.length))),
    });
  }
  return out;
}

export type WriteResult = { ok: true; busy?: boolean } | { ok: false; error: string };

/** Writes (or rewrites) the AI part of a period's review. Safe to call from two pages at once. */
export async function writePeriodReview(studentId: string, day: string): Promise<WriteResult> {
  const db = await createClient();
  const period = await getPeriod(studentId, day);
  if (!period) return { ok: false, error: "That period hasn't started yet." };
  if (!period.hasActivity) return { ok: false, error: "No practice logged since that lesson yet." };
  if (period.reviewUpToDate) return { ok: true };

  const { data: student } = await db.from("students").select("*").eq("id", studentId).maybeSingle();
  if (!student) return { ok: false, error: "That student wasn't found." };

  // Make sure the row exists, then claim it.
  const { error: insErr } = await db
    .from("practice_weeks")
    .upsert(
      { student_id: studentId, teacher_id: student.teacher_id, week_start: period.start, status: "done" },
      { onConflict: "student_id,week_start", ignoreDuplicates: true },
    );
  if (insErr) {
    return {
      ok: false,
      error: "Practice reviews aren't set up in Supabase yet. Run practice-weeks.sql in the Supabase SQL Editor.",
    };
  }
  const staleIso = new Date(Date.now() - STALE_MS).toISOString();
  const { data: claimed } = await db
    .from("practice_weeks")
    .update({ status: "generating", error: null, updated_at: new Date().toISOString() })
    .eq("student_id", studentId)
    .eq("week_start", period.start)
    .or(`status.neq.generating,updated_at.lt.${staleIso}`)
    .select("*")
    .maybeSingle();
  if (!claimed) return { ok: true, busy: true }; // another page is already writing it

  const prevRow = period.prevStart ? await loadRow(db, studentId, period.prevStart) : null;
  const prevReview = prevRow?.review ? (prevRow.review as unknown as PeriodReview) : null;

  let usage: ClaudeUsage[] = [];
  try {
    const out = await analyzePeriod(periodInput(student, period, prevReview));
    usage = out.usage;
    await logUsage(db, claimed, usage);
    await db
      .from("practice_weeks")
      .update({
        status: "done",
        review: out.review as unknown as Json,
        through_date: period.through,
        session_count: period.stats.sessions,
        generated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        error: null,
      })
      .eq("id", claimed.id);
    return { ok: true };
  } catch (e) {
    if (e instanceof DraftError) usage = e.usage;
    await logUsage(db, claimed, usage);
    const msg =
      e instanceof DraftError || e instanceof MissingKeyError
        ? e.message
        : e instanceof Error && e.message
          ? e.message.slice(0, 300)
          : "Something went wrong.";
    await db
      .from("practice_weeks")
      .update({ status: "error", error: msg, updated_at: new Date().toISOString() })
      .eq("id", claimed.id);
    return { ok: false, error: msg };
  }
}

function periodInput(student: Tables<"students">, p: PeriodData, prev: PeriodReview | null): string {
  const day = (d: string) => formatDate(d, "weekday");
  const span = p.startsWithLesson
    ? `From the lesson on ${day(p.start)}${p.nextLesson ? ` to the next lesson on ${day(p.nextLesson)}` : ""}`
    : `Before the first lesson${p.nextLesson ? ` (on ${day(p.nextLesson)})` : ""}, from ${day(p.start)}`;
  const lines: string[] = [
    `Student: ${student.name}${student.age ? `, age ${student.age}` : ""}. Instrument: ${student.instrument}. Current book: ${student.current_book || "not set"}.`,
    `Period: ${span}, ${p.stats.dayCount} days${p.isCurrent ? ` (the next lesson hasn't happened yet; so far through ${day(p.through)})` : ""}.`,
    `This period: practised ${p.stats.daysPracticed} of ${p.stats.dayCount} days, ${p.stats.totalMinutes} min logged, ${p.stats.sessions} recorded sessions with ${p.stats.playingMinutes} min of playing.`,
  ];
  if (p.prevStats)
    lines.push(
      `Previous period (lesson to lesson): practised ${p.prevStats.daysPracticed} of ${p.prevStats.dayCount} days, ${p.prevStats.totalMinutes} min logged, ${p.prevStats.sessions} recorded sessions.`,
    );
  const focus = p.lessons.filter((l) => l.focus_points).map((l) => `(${day(l.lesson_date)} lesson) ${l.focus_points}`);
  if (focus.length) lines.push(`Teacher's focus:\n${focus.join("\n")}`);
  if (p.assigned.length)
    lines.push(
      `Assignments and the days they were ticked:\n${p.assigned
        .map((a) => `${a.title} (${a.kind}): ${a.days.length ? a.days.map(day).join(", ") : "not ticked"}`)
        .join("\n")}`,
    );
  if (p.current.length)
    lines.push(
      `Other current pieces and the days they were heard in a recorded session:\n${p.current
        .map((c) => `${c.title}: ${c.days.length ? c.days.map(day).join(", ") : "not heard"}`)
        .join("\n")}`,
    );
  const sess = p.sessions.filter((s) => s.status === "done" && s.review);
  if (sess.length)
    lines.push(
      `Recorded sessions:\n${sess
        .map((s) => {
          const r = s.review!;
          const parts = [
            `${day(s.practice_date)}, ${Math.round(s.duration_seconds / 60)} min${r.counted === false ? " (not counted)" : ""}: ${r.summary}`,
          ];
          if (r.scales?.length) parts.push(`  Scales and arpeggios found by code: ${r.scales.map(scaleLine).join("; ")}`);
          if (r.intonation)
            parts.push(
              `  Intonation (code${(r.intonation.v ?? 1) < INTONATION_VERSION ? ", old scale" : ""}): overall ${verdictText(r.intonation.verdict)}, ${r.intonation.score}% in tune${r.intonation.typical !== undefined ? `, typical miss ${r.intonation.typical} cents` : ""}${r.intonation.tendencies.length ? ` (${r.intonation.tendencies.map(tendencyText).join(", ")})` : ""}${r.intonation.groups.map((g) => `; ${g.label} ${verdictText(g.verdict)}, ${g.score}% in tune${g.right_notes !== undefined ? `, right notes ${g.right_notes}%` : ""}${g.tendencies.length ? ` (${g.tendencies.map(tendencyText).join(", ")})` : ""}`).join("")}`,
            );
          if (r.going_well?.length) parts.push(`  Going well: ${r.going_well.map((x) => x.text).join("; ")}`);
          const work = r.work_on?.length ? r.work_on.map((x) => x.text) : (r.tips ?? []);
          if (work.length) parts.push(`  Work on: ${work.join("; ")}`);
          if (r.teacher_note) parts.push(`  Teacher note: ${r.teacher_note}`);
          return parts.join("\n");
        })
        .join("\n")}`,
    );
  const notes = p.logs.filter((l) => l.parent_note?.trim());
  if (notes.length) lines.push(`Parent notes:\n${notes.map((l) => `${day(l.practice_date)}: ${l.parent_note}`).join("\n")}`);
  if (prev?.work_on.length)
    lines.push(`The previous period's "work on" points:\n${prev.work_on.map((x) => x.text).join("\n")}`);
  return lines.join("\n\n");
}

async function logUsage(db: Db, row: PracticePeriodRow, usage: ClaudeUsage[]) {
  if (!usage.length) return;
  await db.from("ai_usage").insert(
    usage.map((u) => ({
      teacher_id: row.teacher_id,
      practice_week_id: row.id,
      kind: "weekly",
      provider: "anthropic",
      model: u.model,
      input_tokens: u.input_tokens,
      output_tokens: u.output_tokens,
      cache_read_tokens: u.cache_read_tokens,
      cache_write_tokens: u.cache_write_tokens,
      cost_usd: Math.round(claudeCost(u) * 1_000_000) / 1_000_000,
    })),
  );
}
