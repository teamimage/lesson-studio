import "server-only";
import { createClient } from "@/lib/supabase/server";
import { proposeFocus } from "@/lib/ai/propose-focus";
import { DraftError } from "@/lib/ai/draft-lesson";
import { claudeCost, type ClaudeUsage } from "@/lib/ai/pricing";
import { addDays } from "@/lib/format";
import { focusDb } from "./data";
import { unmentionedRun } from "./rules";
import { MAX_FOCUS, type FocusEventRow, type FocusItemRow } from "./types";

/** A point two lessons running without a mention parks itself. */
const PARK_AFTER_LESSONS = 2;
/** A parked point nobody has mentioned for this long closes. */
const CLOSE_AFTER_DAYS = 30;

export type ProposeResult = { ok: true; suggested: number } | { ok: false; error: string };

/**
 * Suggests the list from an approved lesson and records what the lesson
 * showed about the points already on it. New points are saved as
 * suggestions for the teacher; nothing here reaches the family by itself.
 * Does nothing (quietly) before working-on.sql has run.
 */
export async function proposeFromLesson(lessonId: string): Promise<ProposeResult> {
  const db = await createClient();
  const f = focusDb(db);
  const { data: lesson } = await db.from("lessons").select("*, lesson_pieces(*), assignments(*)").eq("id", lessonId).maybeSingle();
  if (!lesson || lesson.status !== "approved") return { ok: false, error: "Approve the lesson record first." };
  const { data: itemRows, error } = await f
    .from("focus_items")
    .select("*")
    .eq("student_id", lesson.student_id)
    .in("state", ["open", "watching"])
    .order("sort_order", { ascending: true });
  if (error) return { ok: false, error: "The list isn't set up yet (working-on.sql hasn't been run)." };
  const items = (itemRows ?? []) as FocusItemRow[];

  const [{ data: student }, { data: transcript }] = await Promise.all([
    db.from("students").select("name, age, instrument, current_book, teacher_id").eq("id", lesson.student_id).maybeSingle(),
    db.from("lesson_transcripts").select("transcript").eq("lesson_id", lessonId).not("transcript", "is", null).limit(1).maybeSingle(),
  ]);
  const assignments = lesson.assignments.slice().sort((a, b) => a.sort_order - b.sort_order);
  // The teacher often names her priorities as the lesson winds up.
  const ending = (transcript?.transcript ?? "").split(/\s+/).slice(-1200).join(" ");
  const input = [
    `Student: ${student?.name ?? "the student"}${student?.age ? `, age ${student.age}` : ""}. Instrument: ${student?.instrument ?? "not set"}. Lesson on ${lesson.lesson_date}.`,
    lesson.summary ? `Summary:\n${lesson.summary}` : "",
    lesson.focus_points ? `The teacher's focus:\n${lesson.focus_points}` : "",
    lesson.parent_message ? `To the parent:\n${lesson.parent_message}` : "",
    lesson.lesson_pieces.length
      ? `Pieces:\n${lesson.lesson_pieces.map((p) => `${p.title} (${p.activity})${p.notes ? `: ${p.notes}` : ""}`).join("\n")}`
      : "",
    assignments.length
      ? `Practice checklist (id | title | how):\n${assignments.map((a) => `${a.id} | ${a.title} | ${a.how ?? ""}`).join("\n")}`
      : "",
    items.length
      ? `Already on the list (id | title | piece | since):\n${items.map((i) => `${i.id} | ${i.title} | ${i.piece} | ${i.opened_on}${i.state === "watching" ? " (parked)" : ""}`).join("\n")}`
      : "Nothing is on the list yet.",
    ending ? `<lesson_ending>\n${ending}\n</lesson_ending>` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  let usage: ClaudeUsage[] = [];
  let proposal;
  try {
    const out = await proposeFocus(input);
    proposal = out.proposal;
    usage = out.usage;
  } catch (e) {
    if (e instanceof DraftError) usage = e.usage;
    await logUsage(db, student?.teacher_id, lessonId, usage);
    return { ok: false, error: e instanceof Error && e.message ? e.message.slice(0, 200) : "Something went wrong." };
  }
  await logUsage(db, student?.teacher_id, lessonId, usage);

  // What this lesson showed about the points already there.
  const known = new Map(items.map((i) => [i.id, i]));
  const heard = proposal.existing.filter((e) => known.has(e.id));
  await f.from("focus_events").delete().eq("lesson_id", lessonId).eq("source", "lesson");
  if (heard.length)
    await f.from("focus_events").insert(
      heard.map((e) => ({
        focus_item_id: e.id,
        student_id: lesson.student_id,
        event_date: lesson.lesson_date,
        source: "lesson",
        lesson_id: lessonId,
        verdict: e.verdict,
        note: e.note.slice(0, 200),
      })),
    );

  const keptIds = new Set(proposal.focus.map((p) => p.existing_id).filter((id) => known.has(id)));
  const validRows = new Set(assignments.map((a) => a.id));
  const { data: allEvents } = await f.from("focus_events").select("*").in("focus_item_id", items.length ? items.map((i) => i.id) : [lessonId]);
  for (const item of items) {
    const verdict = heard.find((e) => e.id === item.id)?.verdict;
    const mine = ((allEvents ?? []) as FocusEventRow[]).filter((e) => e.focus_item_id === item.id);
    const lastSaid = mine.filter((e) => e.verdict !== "not_mentioned" && e.verdict !== "not_heard").map((e) => e.event_date).sort().pop() ?? item.opened_on;
    if (verdict === "done") {
      await f.from("focus_items").update({ state: "closed", closed_on: lesson.lesson_date }).eq("id", item.id);
    } else if (keptIds.has(item.id)) {
      const p = proposal.focus.find((x) => x.existing_id === item.id)!;
      await f
        .from("focus_items")
        .update({
          state: "open",
          do_first: p.do_first.filter((id) => validRows.has(id)).slice(0, 2),
          ...(item.parent_cue ? {} : { parent_cue: p.parent_cue.slice(0, 240) }),
        })
        .eq("id", item.id);
    } else if (item.state === "watching" && lastSaid < addDays(lesson.lesson_date, -CLOSE_AFTER_DAYS)) {
      await f.from("focus_items").update({ state: "closed", closed_on: lesson.lesson_date }).eq("id", item.id);
    } else if (item.state === "open" && unmentionedRun(mine) >= PARK_AFTER_LESSONS) {
      await f.from("focus_items").update({ state: "watching", do_first: [] }).eq("id", item.id);
    }
  }

  // New points wait for the teacher. Older suggestions she never answered go.
  await f.from("focus_items").delete().eq("student_id", lesson.student_id).eq("state", "proposed");
  const fresh = proposal.focus.filter((p) => !known.has(p.existing_id) && p.title.trim()).slice(0, MAX_FOCUS);
  if (fresh.length)
    await f.from("focus_items").insert(
      fresh.map((p, i) => ({
        student_id: lesson.student_id,
        title: p.title.trim().slice(0, 120),
        piece: p.piece.trim().slice(0, 120),
        parent_cue: p.parent_cue.trim().slice(0, 240),
        state: "proposed",
        lesson_id: lessonId,
        do_first: p.do_first.filter((id) => validRows.has(id)).slice(0, 2),
        opened_on: lesson.lesson_date,
        sort_order: 100 + i,
      })),
    );
  return { ok: true, suggested: fresh.length };
}

async function logUsage(db: Awaited<ReturnType<typeof createClient>>, teacherId: string | null | undefined, lessonId: string, usage: ClaudeUsage[]) {
  if (!usage.length || !teacherId) return;
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
