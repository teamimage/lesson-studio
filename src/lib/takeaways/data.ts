import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/format";
import { guestOf } from "@/lib/guest";
import { writeLessonTakeaways } from "@/lib/ai/lesson-takeaways";
import { teachingStyleFor } from "@/lib/ai/teaching-style";
import { DraftError } from "@/lib/ai/draft-lesson";
import { MissingKeyError } from "@/lib/ai/assemblyai";
import { claudeCost, type ClaudeUsage } from "@/lib/ai/pricing";
import type { Tables } from "@/lib/supabase/types";
import { TAKEAWAY_LESSONS, type TakeawayLesson, type Takeaways, type TakeawaysView } from "./types";

// The "Main takeaways" box: Claude's comparison of the last three approved
// lessons, stored one row per student in lesson_takeaways. Only approved
// lessons count, so the teacher and the family see the same box, and only
// what the family may read goes in (never the teacher's private notes).
// The row is rewritten whenever the three lessons, or anything in them,
// change; source_key records which version it was written from.

type Db = Awaited<ReturnType<typeof createClient>>;
type LessonRow = Tables<"lessons"> & { lesson_pieces: Tables<"lesson_pieces">[]; assignments: Tables<"assignments">[] };
type Row = {
  student_id: string;
  teacher_id: string;
  source_key: string;
  status: "generating" | "done" | "error";
  takeaways: Takeaways | null;
  error: string | null;
  updated_at: string;
};

/** A writer that died mid-way frees the row after this long. */
const STALE_MS = 5 * 60 * 1000;

// lesson_takeaways isn't in the generated types, and every read must come
// back "not set up" rather than break the page before the SQL has run.
function untyped(db: Db): SupabaseClient {
  return db as unknown as SupabaseClient;
}

async function lastApproved(db: Db, studentId: string): Promise<LessonRow[]> {
  const { data } = await db
    .from("lessons")
    .select("*, lesson_pieces(*), assignments(*)")
    .eq("student_id", studentId)
    .eq("status", "approved")
    .order("lesson_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(TAKEAWAY_LESSONS);
  // Oldest first: lesson 1 is the earliest of the ones compared.
  return ((data ?? []) as LessonRow[]).reverse();
}

/** Changes whenever a compared lesson, its pieces, its checklist or its guest changes. */
function sourceKey(lessons: LessonRow[]): string {
  const text = lessons
    .map((l) =>
      JSON.stringify([
        l.id,
        l.updated_at,
        guestOf(l) ?? "",
        l.summary ?? "",
        l.focus_points ?? "",
        l.parent_message ?? "",
        l.lesson_pieces.map((p) => [p.id, p.title, p.activity, p.notes ?? ""]).sort(),
        l.assignments.map((a) => [a.id, a.title, a.how ?? ""]).sort(),
      ]),
    )
    .join("\n");
  return createHash("sha1").update(text).digest("hex");
}

function view(l: LessonRow): TakeawayLesson {
  return { id: l.id, date: l.lesson_date, guest: guestOf(l) };
}

async function loadRow(db: Db, studentId: string): Promise<{ ok: boolean; row: Row | null }> {
  const { data, error } = await untyped(db).from("lesson_takeaways").select("*").eq("student_id", studentId).maybeSingle();
  if (error) return { ok: false, row: null };
  return { ok: true, row: (data as Row | null) ?? null };
}

/** What the box shows for a student. */
export async function getTakeaways(studentId: string): Promise<TakeawaysView> {
  const db = await createClient();
  const [lessons, { ok, row }] = await Promise.all([lastApproved(db, studentId), loadRow(db, studentId)]);
  if (!ok) return { state: "not_set_up" };
  if (!lessons.length) return { state: "no_lessons" };
  const key = sourceKey(lessons);
  const writing = row?.status === "generating" && Date.now() - new Date(row.updated_at).getTime() < STALE_MS;
  return {
    state: "ready",
    lessons: lessons.map(view),
    data: row?.takeaways ?? null,
    stale: !row || row.source_key !== key || (row.status !== "done" && !writing),
    writing,
    error: row?.status === "error" ? row.error : null,
  };
}

export type WriteResult = { ok: true; busy?: boolean } | { ok: false; error: string };

/** Writes (or rewrites) the takeaways when they are out of date. Safe to call from two pages at once. */
export async function writeTakeaways(studentId: string, force = false): Promise<WriteResult> {
  const db = await createClient();
  const t = untyped(db);
  const [lessons, { ok, row }] = await Promise.all([lastApproved(db, studentId), loadRow(db, studentId)]);
  if (!ok) return { ok: false, error: "Main takeaways aren't set up yet. Run lesson-takeaways.sql in the Supabase SQL Editor." };
  if (!lessons.length) return { ok: false, error: "There is no approved lesson to take from yet." };
  const key = sourceKey(lessons);
  if (!force && row?.status === "done" && row.source_key === key) return { ok: true };

  const { data: student } = await db.from("students").select("*").eq("id", studentId).maybeSingle();
  if (!student) return { ok: false, error: "That student wasn't found." };

  // Make sure the row exists, then claim it.
  const { error: insErr } = await t
    .from("lesson_takeaways")
    .upsert({ student_id: studentId, teacher_id: student.teacher_id, status: "done" }, { onConflict: "student_id", ignoreDuplicates: true });
  if (insErr) return { ok: false, error: "Couldn't save the takeaways. Try again." };
  const staleIso = new Date(Date.now() - STALE_MS).toISOString();
  const { data: claimed } = await t
    .from("lesson_takeaways")
    .update({ status: "generating", error: null, updated_at: new Date().toISOString() })
    .eq("student_id", studentId)
    .or(`status.neq.generating,updated_at.lt.${staleIso}`)
    .select("student_id")
    .maybeSingle();
  if (!claimed) return { ok: true, busy: true }; // another page is already writing it

  const newest = lessons[lessons.length - 1];
  let usage: ClaudeUsage[] = [];
  try {
    const style = await teachingStyleFor(db, student.teacher_id);
    const out = await writeLessonTakeaways(takeawaysInput(student, lessons), style);
    usage = out.usage;
    await logUsage(db, student.teacher_id, newest.id, usage);
    await t
      .from("lesson_takeaways")
      .update({
        status: "done",
        takeaways: tidy(out.takeaways, lessons.length),
        source_key: key,
        lesson_ids: lessons.map((l) => l.id),
        generated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        error: null,
      })
      .eq("student_id", studentId);
    return { ok: true };
  } catch (e) {
    if (e instanceof DraftError) usage = e.usage;
    await logUsage(db, student.teacher_id, newest.id, usage);
    const msg =
      e instanceof DraftError || e instanceof MissingKeyError
        ? e.message
        : e instanceof Error && e.message
          ? e.message.slice(0, 300)
          : "Something went wrong.";
    await t.from("lesson_takeaways").update({ status: "error", error: msg, updated_at: new Date().toISOString() }).eq("student_id", studentId);
    return { ok: false, error: msg };
  }
}

/** Keeps the stored text within what the box is built for. */
function tidy(t: Takeaways, count: number): Takeaways {
  const nums = (xs: number[]) => [...new Set(xs)].filter((n) => Number.isInteger(n) && n >= 1 && n <= count).sort((a, b) => a - b);
  return {
    overall: (t.overall ?? "").trim().slice(0, 400),
    takeaways: (t.takeaways ?? [])
      .filter((p) => p.text?.trim())
      .slice(0, 4)
      .map((p) => ({ text: p.text.trim().slice(0, 200), piece: (p.piece ?? "").trim().slice(0, 120), scope: p.scope, lessons: nums(p.lessons ?? []) })),
    specifics: (t.specifics ?? [])
      .filter((p) => p.text?.trim())
      .slice(0, 8)
      .map((p) => ({ text: p.text.trim().slice(0, 200), piece: (p.piece ?? "").trim().slice(0, 120), lessons: nums(p.lessons ?? []) })),
  };
}

function takeawaysInput(student: Tables<"students">, lessons: LessonRow[]): string {
  const head = `Student: ${student.name}${student.age ? `, age ${student.age}` : ""}. Instrument: ${student.instrument}. Current book: ${student.current_book || "not set"}.`;
  const blocks = lessons.map((l, i) => {
    const guest = guestOf(l);
    const parts = [
      `Lesson ${i + 1}, ${formatDate(l.lesson_date, "weekday")}. Taught by ${guest ? "a guest instructor" : "the regular teacher"}.`,
      l.summary ? `Summary:\n${l.summary}` : "",
      l.focus_points ? `The teacher's focus:\n${l.focus_points}` : "",
      l.parent_message ? `To the parent:\n${l.parent_message}` : "",
      l.lesson_pieces.length
        ? `Pieces:\n${[...l.lesson_pieces]
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((p) => `${p.title} (${p.activity})${p.notes ? `: ${p.notes}` : ""}`)
            .join("\n")}`
        : "",
      l.assignments.length
        ? `Practice checklist:\n${[...l.assignments]
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((a) => `${a.title}${a.how ? `: ${a.how}` : ""}`)
            .join("\n")}`
        : "",
    ];
    return `<lesson number="${i + 1}">\n${parts.filter(Boolean).join("\n\n")}\n</lesson>`;
  });
  return [head, `${lessons.length} lesson${lessons.length === 1 ? "" : "s"}, oldest first:`, ...blocks].join("\n\n");
}

async function logUsage(db: Db, teacherId: string, lessonId: string, usage: ClaudeUsage[]) {
  if (!usage.length) return;
  await db.from("ai_usage").insert(
    usage.map((u) => ({
      teacher_id: teacherId,
      lesson_id: lessonId,
      kind: "draft",
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
