import "server-only";
import type { Json } from "@/lib/supabase/types";
import { createClient } from "@/lib/supabase/server";
import { parseActivity, tuningChecksOf, withTuningChecks, type ActivitySecond } from "./activity";
import { reviewSession, type PracticeSession } from "./process";

// Joining recorded practice sessions from the same day into one, for a
// practice that was recorded in pieces (Stop pressed by mistake, a break,
// a second sitting). The recordings themselves are deleted after each
// review, so the join works from what is kept: each session's sound
// timeline (joined end to end, later parts shifted to start where the one
// before ended) and transcript (one after the other, with part headings).
// The earliest session becomes the joined one and is reviewed again from
// the joined material; the others are removed. Everything needed to undo it
// is kept on the joined session (`merged_from`), so "Split back" restores
// the original sessions and reviews exactly as they were, without paying
// for new reviews.
//
// Minutes in the day's practice log stay right: each session added its
// minutes when first reviewed (unless it wasn't counted), so the joined
// session's minutes replace the parts' minutes, and splitting back reverses it.

type Db = Awaited<ReturnType<typeof createClient>>;

type MergedFrom = {
  /** The original session rows, earliest first, exactly as they were. */
  rows: PracticeSession[];
  /** Where each part starts on the joined timeline, in seconds. */
  parts: { id: string; offset: number }[];
  merged_at: string;
};

export type MergeResult = { ok: true; id: string } | { ok: false; error: string };

const MISSING_SQL = "Joining practices isn't set up yet: run admin/practice-merge.sql in Supabase first.";

function mergedFromOf(s: PracticeSession): MergedFrom | null {
  const m = (s as { merged_from?: unknown }).merged_from as MergedFrom | null | undefined;
  return m && Array.isArray(m.rows) && m.rows.length ? m : null;
}

/** Minutes a session put into the practice log when it was reviewed. */
function logMinutes(s: Pick<PracticeSession, "applied" | "counted" | "duration_seconds">): number {
  if (!s.applied || s.counted === false) return 0;
  return Math.max(1, Math.round(s.duration_seconds / 60));
}

async function shiftLogMinutes(db: Db, s: PracticeSession, delta: number) {
  if (!delta) return;
  const { data: log } = await db
    .from("practice_logs")
    .select("id, minutes")
    .eq("student_id", s.student_id)
    .eq("practice_date", s.practice_date)
    .maybeSingle();
  if (log) {
    await db.from("practice_logs").update({ minutes: Math.max(0, (log.minutes ?? 0) + delta) }).eq("id", log.id);
  } else if (delta > 0) {
    await db.from("practice_logs").insert({
      student_id: s.student_id,
      practice_date: s.practice_date,
      minutes: delta,
      logged_by: s.created_by,
    });
  }
}

/** The parts' sound timelines end to end, with each part's start on the joined timeline. */
export function joinActivity(rows: Pick<PracticeSession, "id" | "activity" | "duration_seconds">[]): {
  activity: ActivitySecond[];
  parts: { id: string; offset: number }[];
  tuning: ReturnType<typeof tuningChecksOf>;
} {
  const activity: ActivitySecond[] = [];
  const parts: { id: string; offset: number }[] = [];
  const tuning: ReturnType<typeof tuningChecksOf> = [];
  let offset = 0;
  for (const r of rows) {
    parts.push({ id: r.id, offset });
    const own = parseActivity(r.activity);
    for (const sec of own) activity.push({ ...sec, t: sec.t + offset });
    tuning.push(...tuningChecksOf(r.activity));
    const lastT = own.length ? own[own.length - 1].t + 1 : 0;
    offset += Math.max(r.duration_seconds, lastT);
  }
  return { activity, parts, tuning };
}

function clockOf(seconds: number): string {
  const m = Math.floor(seconds / 60);
  return `${m}:${String(Math.round(seconds % 60)).padStart(2, "0")}`;
}

function joinTranscripts(rows: PracticeSession[], parts: { offset: number }[]): string {
  const texts = rows.map((r) => r.transcript?.trim() ?? "");
  if (!texts.some(Boolean)) return "";
  return rows
    .map((r, i) => {
      const body = texts[i] || (r.recording_missing ? "(no audio for this part; sound timeline only)" : "(no talking transcribed)");
      return `[Part ${i + 1}, from ${clockOf(parts[i].offset)}]\n${body}`;
    })
    .join("\n\n");
}

/**
 * Joins two or more recorded sessions of one student on one day and reviews
 * the joined session. Sessions already joined are taken apart first, so the
 * undo always goes back to the original recordings.
 */
export async function mergeSessions(ids: string[]): Promise<MergeResult> {
  const unique = [...new Set(ids)];
  if (unique.length < 2) return { ok: false, error: "Pick at least two recordings to join." };
  const db = await createClient();
  const { data: picked } = await db.from("practice_sessions").select("*").in("id", unique);
  if (!picked || picked.length !== unique.length) return { ok: false, error: "One of those recordings couldn't be found." };
  if (new Set(picked.map((p) => p.student_id)).size > 1) return { ok: false, error: "Those recordings are for different students." };
  if (new Set(picked.map((p) => p.practice_date)).size > 1) return { ok: false, error: "Only recordings from the same day can be joined." };
  if (picked.some((p) => p.status !== "done" && p.status !== "error"))
    return { ok: false, error: "Wait until every recording has finished its review, then join them." };

  const sorted = picked.slice().sort((a, b) => a.started_at.localeCompare(b.started_at));
  const keeper = sorted[0];
  // The originals, flattening any session that was itself a join.
  const originals = sorted
    .flatMap((p) => mergedFromOf(p)?.rows ?? [p])
    .sort((a, b) => a.started_at.localeCompare(b.started_at));

  const { activity, parts, tuning } = joinActivity(originals);
  const merged: MergedFrom = { rows: originals, parts, merged_at: new Date().toISOString() };
  const last = originals[originals.length - 1];
  const change = {
    activity: withTuningChecks(activity, tuning) as unknown as Json,
    transcript: joinTranscripts(originals, parts) || null,
    duration_seconds: originals.reduce((n, r) => n + r.duration_seconds, 0),
    playing_seconds: originals.reduce((n, r) => n + (r.playing_seconds ?? 0), 0),
    ended_at: last.ended_at,
    media: originals.some((r) => r.media === "video") ? "video" : keeper.media,
    with_helper: originals.some((r) => r.with_helper),
    recording_missing: originals.every((r) => r.recording_missing),
    applied: true,
    status: "analyzing",
    error: null,
    merged_from: merged as unknown as Json,
    updated_at: new Date().toISOString(),
  };
  const { data: joined, error } = await db
    .from("practice_sessions")
    .update(change)
    .eq("id", keeper.id)
    .in("status", ["done", "error"])
    .select("*")
    .maybeSingle();
  if (error) return { ok: false, error: /merged_from/.test(error.message) ? MISSING_SQL : "Couldn't join those recordings." };
  if (!joined) return { ok: false, error: "That recording changed while joining. Try again." };

  const others = sorted.slice(1).map((p) => p.id);
  await db.from("practice_sessions").delete().in("id", others);

  const minutesBefore = sorted.reduce((n, p) => n + logMinutes(p), 0);
  await reviewSession(db, joined);
  const { data: after } = await db.from("practice_sessions").select("*").eq("id", keeper.id).maybeSingle();
  if (after) await shiftLogMinutes(db, after, logMinutes(after) - minutesBefore);
  return { ok: true, id: keeper.id };
}

/** Puts a joined session back into its original recordings and reviews. */
export async function splitSession(id: string): Promise<MergeResult> {
  const db = await createClient();
  const { data: s } = await db.from("practice_sessions").select("*").eq("id", id).maybeSingle();
  if (!s) return { ok: false, error: "That recording couldn't be found." };
  const m = mergedFromOf(s);
  if (!m) return { ok: false, error: "That recording wasn't joined from others." };
  if (s.status === "transcribing" || s.status === "analyzing")
    return { ok: false, error: "Wait until the review has finished, then split it." };

  const [first, ...rest] = m.rows;
  const { id: firstId, ...firstFields } = first;
  const { error } = await db
    .from("practice_sessions")
    .update({ ...firstFields, updated_at: new Date().toISOString() })
    .eq("id", s.id);
  if (error || firstId !== s.id) return { ok: false, error: "Couldn't split that recording." };
  if (rest.length) {
    const { error: insertError } = await db.from("practice_sessions").insert(rest);
    if (insertError) {
      // Put the joined session back rather than lose the other parts.
      await db.from("practice_sessions").update(s).eq("id", s.id);
      return { ok: false, error: "Couldn't split that recording." };
    }
  }
  await shiftLogMinutes(db, s, m.rows.reduce((n, r) => n + logMinutes(r), 0) - logMinutes(s));
  return { ok: true, id: s.id };
}
