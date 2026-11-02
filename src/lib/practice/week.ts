import "server-only";
import { createClient } from "@/lib/supabase/server";
import { addDays, formatDate, parseISODate, todayISO, toISODate } from "@/lib/format";
import type { Json, Tables } from "@/lib/supabase/types";
import { analyzeWeek } from "@/lib/ai/analyze-week";
import { DraftError } from "@/lib/ai/draft-lesson";
import { MissingKeyError } from "@/lib/ai/assemblyai";
import { claudeCost, type ClaudeUsage } from "@/lib/ai/pricing";
import type { PracticeAnalysis, WeekReview } from "./review-types";
import type { PracticeSessionView } from "./data";

// Weekly practice reviews, Monday to Sunday.
//
// Everything countable (days, minutes, check marks per day) is worked out
// live from practice_logs and practice_sessions, so it is always current.
// Claude's written part is stored in practice_weeks. A finished week gets it
// automatically the first time the week (or the Home practice page) is
// opened after Sunday; the current week can be written "so far" on request.

type Db = Awaited<ReturnType<typeof createClient>>;
type Log = Tables<"practice_logs">;
export type PracticeWeekRow = Tables<"practice_weeks">;

const STALE_MS = 5 * 60 * 1000;

/** The Monday on or before a date. */
export function weekStartOf(iso: string): string {
  const d = parseISODate(iso);
  const back = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - back);
  return toISODate(d);
}

export function weekLabel(start: string): string {
  const end = addDays(start, 6);
  const a = parseISODate(start);
  const b = parseISODate(end);
  const left = a.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const right = b.toLocaleDateString("en-US", a.getMonth() === b.getMonth() ? { day: "numeric" } : { month: "short", day: "numeric" });
  return `${left} – ${right}, ${b.getFullYear()}`;
}

export type WeekStats = {
  daysPracticed: number;
  totalMinutes: number;
  sessions: number;
  playingMinutes: number;
};

function practiced(l: Log): boolean {
  return (l.minutes ?? 0) > 0 || l.completed_assignment_ids.length > 0;
}

function statsOf(logs: Log[], sessions: Tables<"practice_sessions">[]): WeekStats {
  const counted = sessions.filter((s) => s.status === "done" && s.counted !== false);
  return {
    daysPracticed: logs.filter(practiced).length,
    totalMinutes: logs.reduce((n, l) => n + (l.minutes ?? 0), 0),
    sessions: counted.length,
    playingMinutes: Math.round(counted.reduce((n, s) => n + s.playing_seconds, 0) / 60),
  };
}

export type CheckGridRow = {
  key: string;
  title: string;
  kind: string | null;
  /** Dates in the week this item was ticked or heard. */
  days: string[];
};

export type WeekData = {
  studentId: string;
  start: string;
  end: string;
  /** Last day counted so far: the Sunday for a finished week, today for this week. */
  through: string;
  isCurrent: boolean;
  isFuture: boolean;
  days: string[];
  logs: Log[];
  sessions: PracticeSessionView[];
  lessons: { id: string; lesson_date: string; focus_points: string | null }[];
  assigned: CheckGridRow[];
  current: CheckGridRow[];
  stats: WeekStats;
  prevStats: WeekStats;
  hasActivity: boolean;
  row: PracticeWeekRow | null;
  review: WeekReview | null;
  /** Written through the whole week (or through today, for this week). */
  reviewUpToDate: boolean;
  /** Start writing the review as soon as the page opens. */
  autoWrite: boolean;
};

async function loadRow(db: Db, studentId: string, start: string): Promise<PracticeWeekRow | null> {
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

export async function getWeek(studentId: string, startIn: string, today = todayISO()): Promise<WeekData> {
  const db = await createClient();
  const start = weekStartOf(startIn);
  const end = addDays(start, 6);
  const prevStart = addDays(start, -7);
  const isCurrent = today >= start && today <= end;
  const isFuture = start > today;
  const through = isCurrent ? today : end;

  const [{ data: logsAll }, { data: sessAll }, { data: lessonsRaw }, { data: repertoire }, row] = await Promise.all([
    db
      .from("practice_logs")
      .select("*")
      .eq("student_id", studentId)
      .gte("practice_date", prevStart)
      .lte("practice_date", end)
      .order("practice_date"),
    db
      .from("practice_sessions")
      .select("*")
      .eq("student_id", studentId)
      .gte("practice_date", prevStart)
      .lte("practice_date", end)
      .order("started_at"),
    db
      .from("lessons")
      .select("id, lesson_date, focus_points, assignments(id, title, kind, sort_order)")
      .eq("student_id", studentId)
      .eq("status", "approved")
      .lte("lesson_date", end)
      .order("lesson_date", { ascending: false })
      .limit(6),
    db.from("repertoire").select("title, status").eq("student_id", studentId),
    loadRow(db, studentId, start),
  ]);

  const logs = (logsAll ?? []).filter((l) => l.practice_date >= start);
  const prevLogs = (logsAll ?? []).filter((l) => l.practice_date < start);
  const sessRows = sessAll ?? [];
  const weekSess = sessRows.filter((s) => s.practice_date >= start);
  const prevSess = sessRows.filter((s) => s.practice_date < start);

  // The plan in force when the week began, plus any lesson during the week.
  const lessonsDesc = lessonsRaw ?? [];
  const firstBefore = lessonsDesc.find((l) => l.lesson_date < start);
  const lessons = lessonsDesc
    .filter((l) => l.lesson_date >= start || l === firstBefore)
    .sort((a, b) => a.lesson_date.localeCompare(b.lesson_date));

  const titles: Record<string, string> = {};
  for (const l of lessonsDesc) for (const a of l.assignments) titles[a.id] = a.title;
  // Sessions may point at an older lesson's assignments.
  const missing = [
    ...new Set(
      weekSess.flatMap((s) => ((s.analysis as PracticeAnalysis | null)?.items ?? []).map((i) => i.assignment_id)),
    ),
  ].filter((id) => !titles[id]);
  if (missing.length) {
    const { data } = await db.from("assignments").select("id, title").in("id", missing);
    for (const a of data ?? []) titles[a.id] = a.title;
  }

  const sessions: PracticeSessionView[] = weekSess.map((s) => ({
    ...s,
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
  // Drop a superseded lesson's items that were never touched, when the titles repeat.
  const titleCount = new Map<string, number>();
  for (const r of assigned) titleCount.set(r.title.toLowerCase(), (titleCount.get(r.title.toLowerCase()) ?? 0) + 1);
  const assignedRows = assigned.filter((r) => r.days.length > 0 || (titleCount.get(r.title.toLowerCase()) ?? 0) < 2 || isLatest(r.key, lessons));

  // Current pieces: heard in a recorded session that day.
  const assignedTitles = assignedRows.map((r) => norm(r.title));
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

  const stats = statsOf(logs, weekSess);
  const prevStats = statsOf(prevLogs, prevSess);
  const hasActivity = stats.daysPracticed > 0 || stats.sessions > 0;
  const review = row?.status !== "generating" && row?.review ? (row.review as unknown as WeekReview) : null;
  const reviewUpToDate =
    !!review && !!row?.through_date && row.through_date >= through && row.session_count >= stats.sessions;
  const generatingFresh = row?.status === "generating" && Date.now() - Date.parse(row.updated_at) < STALE_MS;
  const autoWrite = !isCurrent && !isFuture && hasActivity && !reviewUpToDate && row?.status !== "error" && !generatingFresh;

  return {
    studentId,
    start,
    end,
    through,
    isCurrent,
    isFuture,
    days: Array.from({ length: 7 }, (_, i) => addDays(start, i)),
    logs,
    sessions,
    lessons: lessons.map((l) => ({ id: l.id, lesson_date: l.lesson_date, focus_points: l.focus_points })),
    assigned: assignedRows,
    current,
    stats,
    prevStats,
    hasActivity,
    row,
    review,
    reviewUpToDate,
    autoWrite,
  };

  function isLatest(id: string, ls: typeof lessons) {
    const last = ls[ls.length - 1];
    return !!last?.assignments.some((a) => a.id === id);
  }
}

function norm(t: string) {
  return t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export type WeekListItem = {
  start: string;
  isCurrent: boolean;
  daysPracticed: number;
  totalMinutes: number;
  sessions: number;
  encouragement: string | null;
  needsWriting: boolean;
};

/** This week and recent weeks with any practice, newest first. */
export async function listWeeks(studentId: string, weeks = 8, today = todayISO()): Promise<WeekListItem[]> {
  const db = await createClient();
  const thisWeek = weekStartOf(today);
  const from = addDays(thisWeek, -7 * (weeks - 1));
  const [{ data: logs }, { data: sessions }, { data: rows }] = await Promise.all([
    db.from("practice_logs").select("*").eq("student_id", studentId).gte("practice_date", from),
    db
      .from("practice_sessions")
      .select("practice_date, status, counted")
      .eq("student_id", studentId)
      .gte("practice_date", from),
    db.from("practice_weeks").select("*").eq("student_id", studentId).gte("week_start", from),
  ]);
  const out: WeekListItem[] = [];
  for (let i = 0; i < weeks; i++) {
    const start = addDays(thisWeek, -7 * i);
    const end = addDays(start, 6);
    const inWeek = (d: string) => d >= start && d <= end;
    const l = (logs ?? []).filter((g) => inWeek(g.practice_date));
    const s = (sessions ?? []).filter((x) => inWeek(x.practice_date) && x.status === "done" && x.counted !== false);
    const daysPracticed = l.filter(practiced).length;
    const isCurrent = i === 0;
    if (!isCurrent && daysPracticed === 0 && s.length === 0) continue;
    const row = (rows ?? []).find((r) => r.week_start === start);
    const review = row?.review ? (row.review as unknown as WeekReview) : null;
    out.push({
      start,
      isCurrent,
      daysPracticed,
      totalMinutes: l.reduce((n, g) => n + (g.minutes ?? 0), 0),
      sessions: s.length,
      encouragement: review?.encouragement || null,
      needsWriting:
        !isCurrent &&
        (!row || (row.status === "done" && (!row.through_date || row.through_date < end || row.session_count < s.length))),
    });
  }
  return out;
}

export type WriteResult = { ok: true; busy?: boolean } | { ok: false; error: string };

/** Writes (or rewrites) the AI part of a week's review. Safe to call from two pages at once. */
export async function writeWeekReview(studentId: string, startIn: string): Promise<WriteResult> {
  const db = await createClient();
  const week = await getWeek(studentId, startIn);
  if (week.isFuture) return { ok: false, error: "That week hasn't started yet." };
  if (!week.hasActivity) return { ok: false, error: "No practice logged that week yet." };
  if (week.reviewUpToDate) return { ok: true };

  const { data: student } = await db.from("students").select("*").eq("id", studentId).maybeSingle();
  if (!student) return { ok: false, error: "That student wasn't found." };

  // Make sure the row exists, then claim it.
  const { error: insErr } = await db
    .from("practice_weeks")
    .upsert(
      { student_id: studentId, teacher_id: student.teacher_id, week_start: week.start, status: "done" },
      { onConflict: "student_id,week_start", ignoreDuplicates: true },
    );
  if (insErr) {
    return {
      ok: false,
      error: "Weekly reviews aren't set up in Supabase yet. Run practice-weeks.sql in the Supabase SQL Editor.",
    };
  }
  const staleIso = new Date(Date.now() - STALE_MS).toISOString();
  const { data: claimed } = await db
    .from("practice_weeks")
    .update({ status: "generating", error: null, updated_at: new Date().toISOString() })
    .eq("student_id", studentId)
    .eq("week_start", week.start)
    .or(`status.neq.generating,updated_at.lt.${staleIso}`)
    .select("*")
    .maybeSingle();
  if (!claimed) return { ok: true, busy: true }; // another page is already writing it

  const prevRow = await loadRow(db, studentId, addDays(week.start, -7));
  const prevReview = prevRow?.review ? (prevRow.review as unknown as WeekReview) : null;

  let usage: ClaudeUsage[] = [];
  try {
    const out = await analyzeWeek(weekInput(student, week, prevReview));
    usage = out.usage;
    await logUsage(db, claimed, usage);
    await db
      .from("practice_weeks")
      .update({
        status: "done",
        review: out.review as unknown as Json,
        through_date: week.through,
        session_count: week.stats.sessions,
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

function weekInput(student: Tables<"students">, w: WeekData, prev: WeekReview | null): string {
  const day = (d: string) => formatDate(d, "weekday");
  const lines: string[] = [
    `Student: ${student.name}${student.age ? `, age ${student.age}` : ""}. Instrument: ${student.instrument}. Current book: ${student.current_book || "not set"}.`,
    `Week: ${day(w.start)} to ${day(w.end)}${w.isCurrent ? ` (not finished; so far through ${day(w.through)})` : ""}.`,
    `This week: practised ${w.stats.daysPracticed} of ${w.isCurrent ? w.days.filter((d) => d <= w.through).length : 7} days, ${w.stats.totalMinutes} min logged, ${w.stats.sessions} recorded sessions with ${w.stats.playingMinutes} min of playing.`,
    `Last week: practised ${w.prevStats.daysPracticed} days, ${w.prevStats.totalMinutes} min logged, ${w.prevStats.sessions} recorded sessions.`,
  ];
  const focus = w.lessons.filter((l) => l.focus_points).map((l) => `(${day(l.lesson_date)} lesson) ${l.focus_points}`);
  if (focus.length) lines.push(`Teacher's focus:\n${focus.join("\n")}`);
  if (w.assigned.length)
    lines.push(
      `Assignments and the days they were ticked:\n${w.assigned
        .map((a) => `${a.title} (${a.kind}): ${a.days.length ? a.days.map(day).join(", ") : "not ticked"}`)
        .join("\n")}`,
    );
  if (w.current.length)
    lines.push(
      `Other current pieces and the days they were heard in a recorded session:\n${w.current
        .map((c) => `${c.title}: ${c.days.length ? c.days.map(day).join(", ") : "not heard"}`)
        .join("\n")}`,
    );
  const sess = w.sessions.filter((s) => s.status === "done" && s.review);
  if (sess.length)
    lines.push(
      `Recorded sessions:\n${sess
        .map((s) => {
          const r = s.review!;
          const parts = [
            `${day(s.practice_date)}, ${Math.round(s.duration_seconds / 60)} min${r.counted === false ? " (not counted)" : ""}: ${r.summary}`,
          ];
          if (r.going_well?.length) parts.push(`  Going well: ${r.going_well.map((p) => p.text).join("; ")}`);
          const work = r.work_on?.length ? r.work_on.map((p) => p.text) : (r.tips ?? []);
          if (work.length) parts.push(`  Work on: ${work.join("; ")}`);
          if (r.teacher_note) parts.push(`  Teacher note: ${r.teacher_note}`);
          return parts.join("\n");
        })
        .join("\n")}`,
    );
  const notes = w.logs.filter((l) => l.parent_note?.trim());
  if (notes.length) lines.push(`Parent notes:\n${notes.map((l) => `${day(l.practice_date)}: ${l.parent_note}`).join("\n")}`);
  if (prev?.work_on.length) lines.push(`Last week's "work on" points:\n${prev.work_on.map((p) => p.text).join("\n")}`);
  return lines.join("\n\n");
}

async function logUsage(db: Db, row: PracticeWeekRow, usage: ClaudeUsage[]) {
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
