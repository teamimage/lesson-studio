import "server-only";
import { guestOf } from "@/lib/guest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { proposePlaybook } from "@/lib/ai/propose-playbook";
import { DraftError } from "@/lib/ai/draft-lesson";
import { claudeCost, type ClaudeUsage } from "@/lib/ai/pricing";
import { todayISO } from "@/lib/format";
import { LESSONS_PER_READ, MAX_WAITING, currentLines, type CardQuote, type PlaybookCard, type PlaybookLine } from "./types";

type Db = Awaited<ReturnType<typeof createClient>>;

/** These tables aren't in the generated types; every read returns "nothing" before the SQL has run. */
const raw = (db: Db) => db as unknown as SupabaseClient;

export type Playbook = {
  /** False until teacher-playbook.sql has been run. */
  ready: boolean;
  waiting: PlaybookCard[];
  kept: PlaybookCard[];
  /** Transcribed lessons not read yet. */
  unread: number;
};

export async function loadPlaybook(teacherId: string): Promise<Playbook> {
  const db = await createClient();
  const { data, error } = await raw(db)
    .from("playbook_cards")
    .select("*")
    .eq("teacher_id", teacherId)
    .neq("state", "not_me")
    .order("created_at", { ascending: true });
  if (error) return { ready: false, waiting: [], kept: [], unread: 0 };
  const cards = (data ?? []) as PlaybookCard[];
  return {
    ready: true,
    waiting: cards.filter((c) => c.state === "proposed"),
    kept: cards.filter((c) => c.state === "kept"),
    unread: (await unreadLessons(db, teacherId)).length,
  };
}

type Unread = { lesson_id: string; lesson_date: string; recording_id: string | null; transcript: string; instrument: string };

async function unreadLessons(db: Db, teacherId: string): Promise<Unread[]> {
  const [{ data: rows }, { data: reads }] = await Promise.all([
    db
      .from("lesson_transcripts")
      .select("lesson_id, recording_id, transcript, lessons!inner(*, students!inner(instrument))")
      .eq("teacher_id", teacherId)
      .eq("status", "done")
      .not("transcript", "is", null)
      .limit(60),
    raw(db).from("playbook_reads").select("lesson_id").eq("teacher_id", teacherId),
  ]);
  const read = new Set(((reads ?? []) as { lesson_id: string }[]).map((r) => r.lesson_id));
  const seen = new Set<string>();
  const out: Unread[] = [];
  for (const r of (rows ?? []) as unknown as {
    lesson_id: string;
    recording_id: string | null;
    transcript: string | null;
    lessons: { lesson_date: string; status: string; guest_teacher?: string | null; students: { instrument: string } };
  }[]) {
    // A guest taught it: their cues and words aren't this teacher's playbook.
    if (guestOf(r.lessons)) continue;
    // Only lessons the teacher has approved: a draft may be a home practice saved as a lesson by mistake.
    if (read.has(r.lesson_id) || seen.has(r.lesson_id) || r.lessons.status !== "approved") continue;
    if (!r.transcript || r.transcript.length < 2000) continue;
    seen.add(r.lesson_id);
    out.push({
      lesson_id: r.lesson_id,
      lesson_date: r.lessons.lesson_date,
      recording_id: r.recording_id,
      transcript: r.transcript,
      instrument: r.lessons.students.instrument,
    });
  }
  return out.sort((a, b) => a.lesson_date.localeCompare(b.lesson_date));
}

const LINE = /^\[[\d:–-]+\]\s*([A-Z]{1,2}):\s*(.*)$/;

/** The teacher is taken to be the speaker with the most words (as Craft does). */
function teacherSpeaker(transcript: string): string {
  const words = new Map<string, number>();
  for (const line of transcript.split("\n")) {
    const m = LINE.exec(line);
    if (m) words.set(m[1], (words.get(m[1]) ?? 0) + m[2].split(/\s+/).filter(Boolean).length);
  }
  return [...words.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "A";
}

function seconds(at: string): number {
  const parts = at.replace(/[[\]\s]/g, "").split(":").map(Number);
  if (parts.some((n) => !Number.isFinite(n))) return 0;
  return parts.reduce((total, n) => total * 60 + n, 0);
}

export type ReadResult = { ok: true; cards: number; lessons: number } | { ok: false; error: string };

/**
 * Reads the next few unread lessons and saves the suggested cards for the
 * teacher to answer. Never leaves more than five waiting, and never reads a
 * lesson twice.
 */
export async function readLessons(teacherId: string): Promise<ReadResult> {
  const db = await createClient();
  const { data: cardRows, error } = await raw(db).from("playbook_cards").select("*").eq("teacher_id", teacherId);
  if (error) return { ok: false, error: "The playbook isn't set up yet (teacher-playbook.sql hasn't been run)." };
  const cards = (cardRows ?? []) as PlaybookCard[];
  const waiting = cards.filter((c) => c.state === "proposed").length;
  if (waiting >= MAX_WAITING) return { ok: false, error: "Answer the cards that are waiting first." };
  const lessons = (await unreadLessons(db, teacherId)).slice(0, LESSONS_PER_READ);
  if (!lessons.length) return { ok: false, error: "There are no new lesson recordings to read yet." };

  const list = (state: PlaybookCard["state"]) =>
    cards
      .filter((c) => c.state === state)
      .map((c) => `${c.id} | ${c.kind} | ${c.instrument} | ${c.body}`)
      .join("\n");
  const input = [
    list("kept") ? `Cards already kept (id | kind | instrument | card):\n${list("kept")}` : "No cards are kept yet.",
    list("not_me") ? `Cards the teacher marked "Not me" (never suggest these again):\n${list("not_me")}` : "",
    list("proposed") ? `Cards still waiting for an answer (do not repeat):\n${list("proposed")}` : "",
    ...lessons.map(
      (l, i) =>
        `<lesson number="${i + 1}" date="${l.lesson_date}" instrument="${l.instrument}" teacher="${teacherSpeaker(l.transcript)}">\n${l.transcript.slice(0, 120_000)}\n</lesson>`,
    ),
  ]
    .filter(Boolean)
    .join("\n\n");

  let usage: ClaudeUsage[] = [];
  let proposal;
  try {
    const out = await proposePlaybook(input);
    proposal = out.proposal;
    usage = out.usage;
  } catch (e) {
    if (e instanceof DraftError) usage = e.usage;
    await logUsage(db, teacherId, usage);
    return { ok: false, error: e instanceof Error && e.message ? e.message.slice(0, 200) : "Something went wrong." };
  }
  await logUsage(db, teacherId, usage);

  const fresh = proposal.cards
    .map((c) => ({
      teacher_id: teacherId,
      kind: c.kind,
      instrument: c.kind === "rule" ? "" : c.instrument.trim().toLowerCase().slice(0, 40),
      section: c.section,
      body: c.body.trim().slice(0, 400),
      quotes: c.quotes.flatMap((q): CardQuote[] => {
        const l = lessons[q.lesson - 1];
        if (!l || !q.quote.trim()) return [];
        return [{ lesson_id: l.lesson_id, lesson_date: l.lesson_date, recording_id: l.recording_id, seconds: seconds(q.at), quote: q.quote.trim().slice(0, 240) }];
      }).slice(0, 3),
      state: "proposed",
      last_heard_on: lessons[lessons.length - 1].lesson_date,
    }))
    // A card needs two moments behind it, or it isn't a habit.
    .filter((c) => c.body && c.quotes.length >= 2)
    .slice(0, MAX_WAITING - waiting);
  if (fresh.length) await raw(db).from("playbook_cards").insert(fresh);

  const newest = lessons[lessons.length - 1].lesson_date;
  const again = proposal.heard_again.filter((id) => cards.some((c) => c.id === id && c.state === "kept"));
  if (again.length) await raw(db).from("playbook_cards").update({ last_heard_on: newest }).in("id", again).eq("teacher_id", teacherId);
  await raw(db)
    .from("playbook_reads")
    .upsert(lessons.map((l) => ({ lesson_id: l.lesson_id, teacher_id: teacherId })), { onConflict: "lesson_id" });
  return { ok: true, cards: fresh.length, lessons: lessons.length };
}

async function logUsage(db: Db, teacherId: string, usage: ClaudeUsage[]) {
  if (!usage.length) return;
  await db.from("ai_usage").insert(
    usage.map((u) => ({
      teacher_id: teacherId,
      kind: "assistant",
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

/**
 * The kept lines for a teacher, as the reviews use them. Works from a
 * family's sign-in too (through the playbook_lines function), and returns
 * nothing before the SQL has run.
 */
export async function keptLines(db: Db, teacherId: string): Promise<PlaybookLine[]> {
  const { data, error } = await raw(db).rpc("playbook_lines", { for_teacher: teacherId });
  if (error || !data) return [];
  return currentLines(data as PlaybookLine[], todayISO());
}
