// The tuner on the Practice session card: which notes to tune for each
// instrument, and the record of a tuning check that goes with the session
// so the intonation analysis knows the instrument was set to A = 440.

/** One note to tune to: an open string, or the A for wind and voice. */
export type TuneNote = {
  /** Short name shown on the button ("C", "G", "A"). */
  name: string;
  /** MIDI number at A = 440 (57 = A3). */
  midi: number;
  /** Any octave counts (wind and voice: just find an A). */
  anyOctave?: boolean;
};

/** Open strings, lowest first. */
const STRINGS: Record<string, TuneNote[]> = {
  violin: [
    { name: "G", midi: 55 },
    { name: "D", midi: 62 },
    { name: "A", midi: 69 },
    { name: "E", midi: 76 },
  ],
  viola: [
    { name: "C", midi: 48 },
    { name: "G", midi: 55 },
    { name: "D", midi: 62 },
    { name: "A", midi: 69 },
  ],
  cello: [
    { name: "C", midi: 36 },
    { name: "G", midi: 43 },
    { name: "D", midi: 50 },
    { name: "A", midi: 57 },
  ],
  bass: [
    { name: "E", midi: 28 },
    { name: "A", midi: 33 },
    { name: "D", midi: 38 },
    { name: "G", midi: 43 },
  ],
  guitar: [
    { name: "E", midi: 40 },
    { name: "A", midi: 45 },
    { name: "D", midi: 50 },
    { name: "G", midi: 55 },
    { name: "B", midi: 59 },
    { name: "e", midi: 64 },
  ],
  mandolin: [
    { name: "G", midi: 55 },
    { name: "D", midi: 62 },
    { name: "A", midi: 69 },
    { name: "E", midi: 76 },
  ],
};

/** Tuned by a technician, or too many strings: no tuner. */
const NO_TUNER = new Set(["piano", "organ", "harp"]);

/** The notes to tune for an instrument, or null when there's nothing to tune. */
export function tuneNotesFor(instrument: string): TuneNote[] | null {
  const key = instrument.toLowerCase();
  if (NO_TUNER.has(key)) return null;
  return STRINGS[key] ?? [{ name: "A", midi: 69, anyOctave: true }];
}

export function hasStrings(instrument: string): boolean {
  return !!STRINGS[instrument.toLowerCase()];
}

/** A string counts as tuned within this many cents of A = 440. */
export const TUNED_CENTS = 6;
/** A tuning check counts for the session when done this long before Start, or during it. */
export const TUNING_VALID_SECONDS = 30 * 60;

/** Frequency of a MIDI note at A = 440. */
export function hzOf(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * Which tune note a pitch belongs to, and how many cents off it is, when
 * the pitch is within a semitone and a half of one.
 */
export function nearestTuneNote(midi: number, notes: TuneNote[]): { note: TuneNote; cents: number } | null {
  let best: { note: TuneNote; cents: number } | null = null;
  for (const n of notes) {
    let target = n.midi;
    if (n.anyOctave) target = n.midi + 12 * Math.round((midi - n.midi) / 12);
    const cents = (midi - target) * 100;
    if (Math.abs(cents) <= 150 && (!best || Math.abs(cents) < Math.abs(best.cents))) best = { note: n, cents };
  }
  return best;
}

/**
 * One tuning check, kept with the practice session. `t` is seconds from
 * Start (negative = before Start); `s` is each string's last steady reading
 * in cents from A = 440; `ok` is true when every string ended within
 * TUNED_CENTS.
 */
export type TuningCheck = { t: number; s: Record<string, number>; ok: boolean };

export function parseTuningChecks(raw: unknown): TuningCheck[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x): x is TuningCheck => !!x && typeof x === "object" && typeof (x as TuningCheck).t === "number")
    .slice(0, 20)
    .map((x) => ({
      t: Math.round(Number(x.t)),
      s: Object.fromEntries(
        Object.entries(x.s && typeof x.s === "object" ? x.s : {})
          .filter(([k, v]) => k.length <= 3 && typeof v === "number" && Number.isFinite(v))
          .slice(0, 8)
          .map(([k, v]) => [k, Math.max(-500, Math.min(500, Math.round(v as number)))]),
      ),
      ok: !!x.ok,
    }));
}

/** Whether the session was tuned to A = 440 with the tuner (shortly before Start or during it). */
export function tunedWithTuner(checks: TuningCheck[]): boolean {
  return checks.some((c) => c.ok && c.t >= -TUNING_VALID_SECONDS);
}
