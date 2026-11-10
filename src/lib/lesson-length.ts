import "server-only";
import type { createClient } from "@/lib/supabase/server";

type Db = Awaited<ReturnType<typeof createClient>>;

/**
 * Where a lesson's length came from (lessons.duration_source, added by
 * lesson-length-source.sql):
 *   manual    the teacher typed it; nothing automatic changes it
 *   video     the lesson's videos
 *   timer     Start lesson to End lesson
 *   schedule  carried over from the last lesson or the lesson slot
 *   practice  the practice recording it was converted from
 * Null on lessons saved before the column existed.
 */
export type LengthSource = "manual" | "video" | "timer" | "schedule" | "practice";

type Clip = { duration_seconds: number | null; started_at: string | null };

/**
 * Seconds of lesson the videos cover. Clips with a start time are laid on one
 * timeline and the covered time counted once, so two camera angles of the
 * same lesson count once and a lesson split into two files counts both.
 * Clips without a start time count as their own length. The longest of the
 * two wins.
 */
export function coveredSeconds(clips: Clip[]): number {
  const timed: [number, number][] = [];
  let untimed = 0;
  for (const c of clips) {
    const d = Number(c.duration_seconds);
    if (!Number.isFinite(d) || d <= 0) continue;
    const t = c.started_at ? Date.parse(c.started_at) : NaN;
    if (Number.isFinite(t)) timed.push([t, t + d * 1000]);
    else untimed = Math.max(untimed, d);
  }
  timed.sort((a, b) => a[0] - b[0]);
  let total = 0;
  let cur: [number, number] | null = null;
  for (const [s, e] of timed) {
    if (cur && s <= cur[1]) cur[1] = Math.max(cur[1], e);
    else {
      if (cur) total += cur[1] - cur[0];
      cur = [s, e];
    }
  }
  if (cur) total += cur[1] - cur[0];
  return Math.max(total / 1000, untimed);
}

async function readLesson(db: Db, lessonId: string) {
  const withSource = await db
    .from("lessons")
    .select("id, duration_minutes, duration_source")
    .eq("id", lessonId)
    .maybeSingle();
  if (!withSource.error) return { lesson: withSource.data, hasColumn: true };
  // Before lesson-length-source.sql: no way to tell a typed length, so the
  // video's length is used.
  const plain = await db.from("lessons").select("id, duration_minutes").eq("id", lessonId).maybeSingle();
  return { lesson: plain.data ? { ...plain.data, duration_source: null } : null, hasColumn: false };
}

/** The lesson's length source, or null when unknown (or before the SQL). */
export async function lessonLengthSource(db: Db, lessonId: string): Promise<LengthSource | null> {
  const { lesson } = await readLesson(db, lessonId);
  return (lesson?.duration_source as LengthSource | null) ?? null;
}

/**
 * Writes a length and where it came from. Falls back to the length alone
 * when the duration_source column isn't there yet.
 */
export async function writeLength(db: Db, lessonId: string, minutes: number | null, source: LengthSource | null) {
  const { error } = await db
    .from("lessons")
    .update({ duration_minutes: minutes, duration_source: source })
    .eq("id", lessonId);
  if (error) await db.from("lessons").update({ duration_minutes: minutes }).eq("id", lessonId);
}

/**
 * Sets the lesson's length from its videos (not archived, uploaded, with a
 * known length). A length the teacher typed is kept. With no usable video
 * the length is left as it is. Returns the minutes written, or null.
 */
export async function lengthFromVideos(db: Db, lessonId: string): Promise<number | null> {
  try {
    const { lesson } = await readLesson(db, lessonId);
    if (!lesson || lesson.duration_source === "manual") return null;
    const { data: recs } = await db
      .from("recordings")
      .select("*")
      .eq("lesson_id", lessonId);
    const clips = (recs ?? []).filter((r) => r.status === "ready" && !r.archived_at);
    const seconds = coveredSeconds(clips);
    if (seconds < 30) return null;
    const minutes = Math.max(1, Math.round(seconds / 60));
    if (minutes === lesson.duration_minutes && lesson.duration_source === "video") return minutes;
    await writeLength(db, lessonId, minutes, "video");
    return minutes;
  } catch {
    return null;
  }
}
