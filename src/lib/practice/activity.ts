// The sound timeline of a practice session. While recording, the browser
// listens ten times a second and keeps, for each second: how loud it was
// and which notes it heard. It is small (a few KB a minute) and is what the
// AI mostly reads, since Claude can't listen to an audio file directly.

export type ActivitySecond = {
  /** Seconds from the start. */
  t: number;
  /** Loudest level that second, in dB below full scale (e.g. -30). */
  db: number;
  /** Notes heard, in order, repeats collapsed ("D4", "F#4"). */
  n: string[];
  /** Average distance from the nearest note in cents (0-50), when notes were heard. */
  c?: number;
  /**
   * Fine pitch readings for that second, about 20 of them, in hundredths of
   * a MIDI note (4312 = G2, 12 cents sharp; 0 = no clear pitch). Sessions
   * from before Nov 3 2026 don't have them.
   */
  p?: number[];
};

/** Below this level a second counts as quiet. */
export const QUIET_DB = -50;

export function isPlayingSecond(s: ActivitySecond): boolean {
  return s.db > QUIET_DB && s.n.length > 0;
}

export function playingSeconds(activity: ActivitySecond[]): number {
  return activity.filter(isPlayingSecond).length;
}

/**
 * Sessions with almost no musical sound are not counted and skip the AI
 * (nothing to listen to, nothing to pay for).
 */
export function tooQuiet(activity: ActivitySecond[], durationSeconds: number): boolean {
  const playing = playingSeconds(activity);
  if (playing < 30) return true;
  return durationSeconds > 300 && playing / durationSeconds < 0.05;
}

export function clock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/**
 * The timeline as text for Claude: one line per second with sound,
 * quiet stretches folded into a single line.
 *   0:12 -28dB D4 E4 F#4 (±12c)
 *   0:40-2:10 quiet
 */
export function activityText(activity: ActivitySecond[]): string {
  const lines: string[] = [];
  let quietFrom: number | null = null;
  let quietTo = 0;
  const flushQuiet = () => {
    if (quietFrom === null) return;
    lines.push(quietTo > quietFrom ? `${clock(quietFrom)}-${clock(quietTo)} quiet` : `${clock(quietFrom)} quiet`);
    quietFrom = null;
  };
  for (const s of activity) {
    if (s.db <= QUIET_DB) {
      if (quietFrom === null) quietFrom = s.t;
      quietTo = s.t;
      continue;
    }
    flushQuiet();
    const notes = s.n.length ? ` ${s.n.join(" ")}` : " (sound, no clear pitch)";
    const cents = s.c !== undefined && s.n.length ? ` (±${Math.round(s.c)}c)` : "";
    lines.push(`${clock(s.t)} ${Math.round(s.db)}dB${notes}${cents}`);
  }
  flushQuiet();
  return lines.join("\n");
}

export function parseActivity(raw: unknown): ActivitySecond[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x): x is ActivitySecond => !!x && typeof x === "object" && typeof (x as ActivitySecond).t === "number")
    .map((x) => ({
      t: Number(x.t),
      db: Number(x.db) || -100,
      n: Array.isArray(x.n) ? x.n.map(String).slice(0, 20) : [],
      ...(typeof x.c === "number" ? { c: x.c } : {}),
      ...(Array.isArray(x.p)
        ? { p: x.p.slice(0, 40).map((v) => (typeof v === "number" && v > 0 && v < 13000 ? Math.round(v) : 0)) }
        : {}),
    }));
}
