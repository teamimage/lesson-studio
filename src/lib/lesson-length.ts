import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { getStreamState, streamingEnabled } from "@/lib/stream";

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

/**
 * What the calendars and the lesson page say about a lesson's length after
 * checking it against its videos:
 *   unknown  it has a video but no one could read the video's length
 *   differs  the teacher typed a length far from the video's length
 */
export type LengthFlag = "unknown" | "differs";
export type LengthCheck = { minutes: number | null; flag: LengthFlag | null; videoMinutes: number | null };

type RecRow = {
  id: string;
  lesson_id: string;
  status: string;
  archived_at?: string | null;
  duration_seconds: number | null;
  started_at: string | null;
  stream_uid: string | null;
};

const CF_CHECKS_PER_CALL = 8;

/** Cloudflare's length for a video, or null when it doesn't know (yet). */
async function cloudflareSeconds(uid: string): Promise<number | null> {
  try {
    if (!streamingEnabled()) return null;
    const s = await Promise.race([
      getStreamState(uid),
      new Promise<null>((r) => setTimeout(() => r(null), 4000)),
    ]);
    return s?.durationSeconds ?? null;
  } catch {
    return null;
  }
}

/** A typed length counts as off when it's 5+ minutes and a quarter away from the video's. */
function farApart(typed: number, video: number): boolean {
  const gap = Math.abs(typed - video);
  return gap >= 5 && gap >= video * 0.25;
}

/**
 * Brings lessons' lengths in line with their videos, then says which ones
 * still need a person. For each lesson with an uploaded video:
 *   - a video with no length yet (the browser couldn't read an iPhone file)
 *     gets Cloudflare Stream's length; so does every video of a lesson whose
 *     length hasn't been taken from its videos yet, or of every lesson when
 *     `checkCloudflare` is set (the lesson page), since the browser's
 *     reading can be wrong;
 *   - the length becomes the videos' length, whatever wrote it before
 *     (timer, schedule, older versions of the app), unless the teacher typed it;
 *   - a typed length far from the video's is kept but flagged "differs";
 *   - when no video length can be found at all, the lesson is flagged "unknown".
 * Lessons without a video are left alone. Best effort: errors leave things as they were.
 */
export async function reconcileLengths(
  db: Db,
  lessonIds: string[],
  { checkCloudflare = false }: { checkCloudflare?: boolean } = {},
): Promise<Record<string, LengthCheck>> {
  const out: Record<string, LengthCheck> = {};
  if (!lessonIds.length) return out;
  try {
    let lessons: { id: string; duration_minutes: number | null; duration_source: string | null }[] = [];
    const withSource = await db.from("lessons").select("id, duration_minutes, duration_source").in("id", lessonIds);
    if (!withSource.error) lessons = withSource.data ?? [];
    else {
      const plain = await db.from("lessons").select("id, duration_minutes").in("id", lessonIds);
      lessons = (plain.data ?? []).map((l) => ({ ...l, duration_source: null }));
    }
    // "*" because archived_at comes with archived-videos.sql.
    const { data: recData } = await db.from("recordings").select("*").in("lesson_id", lessonIds);
    const recs = ((recData ?? []) as RecRow[]).filter((r) => r.status === "ready" && !r.archived_at);
    if (!recs.length) {
      for (const l of lessons) out[l.id] = { minutes: l.duration_minutes, flag: null, videoMinutes: null };
      return out;
    }

    const byLesson = new Map<string, RecRow[]>();
    for (const r of recs) byLesson.set(r.lesson_id, [...(byLesson.get(r.lesson_id) ?? []), r]);

    // Ask Cloudflare where the length is missing or not yet trusted.
    const source = new Map(lessons.map((l) => [l.id, l.duration_source]));
    const ask = recs
      .filter((r) => {
        if (!r.stream_uid) return false;
        if (r.duration_seconds == null || !(Number(r.duration_seconds) > 0)) return true;
        const s = source.get(r.lesson_id);
        return checkCloudflare || (s !== "video" && s !== "manual");
      })
      .slice(0, CF_CHECKS_PER_CALL);
    await Promise.all(
      ask.map(async (r) => {
        const seconds = await cloudflareSeconds(r.stream_uid!);
        if (seconds == null) return;
        if (r.duration_seconds != null && Math.abs(Number(r.duration_seconds) - seconds) < 1) return;
        r.duration_seconds = seconds;
        await db.from("recordings").update({ duration_seconds: seconds }).eq("id", r.id);
      }),
    );

    for (const l of lessons) {
      const clips = byLesson.get(l.id);
      if (!clips?.length) {
        out[l.id] = { minutes: l.duration_minutes, flag: null, videoMinutes: null };
        continue;
      }
      const seconds = coveredSeconds(clips);
      const video = seconds >= 30 ? Math.max(1, Math.round(seconds / 60)) : null;
      if (l.duration_source === "manual") {
        const off = video != null && l.duration_minutes != null && farApart(l.duration_minutes, video);
        out[l.id] = { minutes: l.duration_minutes, flag: off ? "differs" : null, videoMinutes: video };
        continue;
      }
      if (video == null) {
        out[l.id] = { minutes: l.duration_minutes, flag: "unknown", videoMinutes: null };
        continue;
      }
      if (video !== l.duration_minutes || l.duration_source !== "video") {
        await writeLength(db, l.id, video, "video");
      }
      out[l.id] = { minutes: video, flag: null, videoMinutes: video };
    }
  } catch {
    // Leave the lengths as they were.
  }
  return out;
}

/** "Use the video's length" on a lesson whose typed length is far off. */
export async function takeVideoLength(db: Db, lessonId: string): Promise<number | null> {
  const { lesson } = await readLesson(db, lessonId);
  if (!lesson) return null;
  if (lesson.duration_source === "manual") await writeLength(db, lessonId, lesson.duration_minutes, null);
  const check = await reconcileLengths(db, [lessonId], { checkCloudflare: true });
  return check[lessonId]?.minutes ?? null;
}
