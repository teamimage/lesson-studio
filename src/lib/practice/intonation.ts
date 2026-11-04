// Intonation for a practice session, graded strictly in cents: for the
// whole session, each scale and each piece, the share of held notes that
// were in tune, how far off the rest were and which way, and the notes that
// lean sharp or flat again and again. Pure code, no AI. Claude only reads
// the summary.
//
// "Right note" and "in tune" are separate: a note is only counted at all
// once it is the nearest semitone, and its cents say how far from the
// middle of that semitone it sat. For scales, right_notes says how many
// notes belonged to the key.
//
// Pitches are measured against equal temperament at A=440, then shifted by
// the instrument's own tuning, taken from the open-string notes (they ring
// true to however the instrument is tuned). Without enough open strings
// the notes are judged against A=440 as they are; the player's own notes
// are never used for this, so playing sharp all session can't hide itself.

import { clock } from "./activity";
import { pitchClassName, type Note } from "./notes";
import type { ScaleSummary } from "./scales";
import type { IntonationGroup, IntonationVerdict, NoteIntonation, SessionIntonation } from "./review-types";

/** Grading scale version stored with each result. */
export const INTONATION_VERSION = 2;

/** Fixed-pitch instruments: nothing for the player to tune. */
const FIXED_PITCH = new Set(["piano", "organ", "harp", "guitar", "mandolin"]);

/** Open strings (MIDI) for the string instruments. */
const OPEN_STRINGS: Record<string, number[]> = {
  cello: [36, 43, 50, 57],
  viola: [48, 55, 62, 69],
  violin: [55, 62, 69, 76],
  bass: [28, 33, 38, 43],
};

/**
 * The cents bands, measured from the instrument's tuning:
 * within IN_TUNE in tune, up to SLIGHT slightly off (a trained ear hears
 * it on a held note), up to CLEAR clearly off, beyond that out of tune.
 */
export const IN_TUNE_CENTS = 7;
export const SLIGHT_CENTS = 15;
export const CLEAR_CENTS = 25;
/** A note whose median sits this far the same way is a tendency. */
const LEAN_CENTS = 8;
/** Fewer held notes than this and there's no verdict. */
const MIN_NOTES = 8;
/**
 * Readings a note needs to be judged (20 a second, so a quarter second).
 * Shorter notes are mostly the attack, a shift or a slide.
 */
const MIN_FRAMES = 5;

const DEGREES = ["1st", "", "2nd", "3rd", "3rd", "4th", "", "5th", "6th", "6th", "7th", "7th"];

export function checksIntonation(instrument: string): boolean {
  return !FIXED_PITCH.has(instrument);
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Held notes with a pitch measurement. */
function held(notes: Note[]): (Note & { cents: number })[] {
  return notes.filter((n): n is Note & { cents: number } => n.cents !== undefined && n.frames >= MIN_FRAMES);
}

/** How far the instrument's tuning sits from A=440, in cents, and from what. */
export function tuning(notes: Note[], instrument: string): { offset: number; from: "open strings" | "A=440" } {
  const open = OPEN_STRINGS[instrument];
  const openNotes = open ? held(notes).filter((n) => open.includes(n.midi)) : [];
  if (openNotes.length < 6) return { offset: 0, from: "A=440" };
  return { offset: Math.max(-30, Math.min(30, Math.round(median(openNotes.map((n) => n.cents))))), from: "open strings" };
}

/** Kept for callers that only want the number. */
export function tuningOffset(notes: Note[], instrument: string): number {
  return tuning(notes, instrument).offset;
}

/**
 * The verdict from the share in tune and the share badly out. Set for a
 * teacher's ear, not for encouragement: "secure" needs nearly every held
 * note within 7 cents.
 */
export function verdictFor(score: number, off = 0): IntonationVerdict {
  if (score >= 85 && off <= 2) return "secure";
  if (score >= 65 && off <= 8) return "mostly";
  if (score >= 45 && off <= 15) return "uneven";
  return "poor";
}

export function verdictText(v: IntonationVerdict): string {
  switch (v) {
    case "secure":
      return "in tune";
    case "mostly":
      return "mostly in tune, some notes off";
    case "uneven":
      return "uneven, many notes off";
    case "poor":
      return "often out of tune";
    // The old lenient scale, until a session is re-graded.
    case "good":
      return "sounding good";
    case "fair":
      return "mostly good";
    default:
      return "needs work";
  }
}

/** Short form for chips and tables. */
export function verdictShort(v: IntonationVerdict): string {
  switch (v) {
    case "secure":
      return "in tune";
    case "mostly":
      return "mostly in tune";
    case "uneven":
      return "uneven";
    case "poor":
      return "often out of tune";
    default:
      return verdictText(v);
  }
}

/** Colour family for a verdict: good, middling or bad. */
export function verdictTone(v: IntonationVerdict): "good" | "mid" | "bad" {
  return v === "secure" || v === "good" ? "good" : v === "mostly" || v === "fair" ? "mid" : "bad";
}

/** "a little sharp" / "clearly flat" / "out of tune, sharp" for a cents figure. */
export function centsWords(c: number): string {
  const a = Math.abs(c);
  const dir = c > 0 ? "sharp" : "flat";
  if (a <= IN_TUNE_CENTS) return "in tune";
  if (a <= SLIGHT_CENTS) return `slightly ${dir}`;
  if (a <= CLEAR_CENTS) return `clearly ${dir}`;
  return `very ${dir}`;
}

/** "+12" / "-8" */
export function signedCents(c: number): string {
  return `${c > 0 ? "+" : c < 0 ? "−" : "±"}${Math.abs(Math.round(c))}`;
}

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR_FORMS: Record<string, number[]> = {
  harmonic: [0, 2, 3, 5, 7, 8, 11],
  melodic: [0, 2, 3, 5, 7, 8, 9, 10, 11], // up melodic, down natural
  natural: [0, 2, 3, 5, 7, 8, 10],
};

/** Pitch classes that belong to a found scale or arpeggio. */
function keyPitchClasses(s: Pick<ScaleSummary, "key" | "kind" | "variant">, tonic: number): Set<number> {
  const minor = /minor/.test(s.key);
  const steps =
    s.kind === "arpeggio"
      ? minor
        ? [0, 3, 7]
        : [0, 4, 7]
      : minor
        ? MINOR_FORMS[s.variant ?? ""] ?? [...new Set([...MINOR_FORMS.harmonic, ...MINOR_FORMS.melodic])]
        : MAJOR;
  return new Set(steps.map((x) => (tonic + x) % 12));
}

/**
 * In-tune share, bands and leaning notes for a set of notes. `tonic`
 * (pitch class) names the leaning notes by scale degree too; `inKey`
 * counts right notes for a scale.
 */
function groupOf(
  label: string,
  kind: IntonationGroup["kind"],
  notes: Note[],
  offset: number,
  tonic?: number,
  inKey?: Set<number>,
): IntonationGroup | null {
  const h = held(notes);
  if (h.length < MIN_NOTES) return null;
  const corrected = h.map((n) => ({ pc: ((n.midi % 12) + 12) % 12, c: n.cents - offset }));
  const share = (f: (c: number) => boolean) =>
    Math.round((corrected.filter((x) => f(x.c)).length / corrected.length) * 100);
  const score = share((c) => Math.abs(c) <= IN_TUNE_CENTS);
  const close = share((c) => Math.abs(c) <= SLIGHT_CENTS);
  const off = share((c) => Math.abs(c) > CLEAR_CENTS);
  const typical = Math.round(median(corrected.map((x) => Math.abs(x.c))));
  const lean = Math.round(median(corrected.map((x) => x.c)));

  const degreeOf = (pc: number) => (tonic === undefined ? "" : DEGREES[(pc - tonic + 12) % 12]);
  const byPc = new Map<number, number[]>();
  for (const x of corrected) byPc.set(x.pc, [...(byPc.get(x.pc) ?? []), x.c]);
  const by_note: NoteIntonation[] = [...byPc.entries()]
    .filter(([, cs]) => cs.length >= 3)
    .map(([pc, cs]) => {
      const degree = degreeOf(pc);
      return {
        note: pitchClassName(pc),
        ...(degree ? { degree } : {}),
        n: cs.length,
        cents: Math.round(median(cs)),
        in_tune: Math.round((cs.filter((c) => Math.abs(c) <= IN_TUNE_CENTS).length / cs.length) * 100),
      };
    })
    .sort((a, b) => b.n - a.n);
  const tendencies = by_note
    .filter((t) => Math.abs(t.cents) >= LEAN_CENTS)
    .sort((a, b) => Math.abs(b.cents) - Math.abs(a.cents))
    .slice(0, 4)
    .map((t) => ({ note: t.note, ...(t.degree ? { degree: t.degree } : {}), cents: t.cents }));

  const right_notes = inKey
    ? Math.round((corrected.filter((x) => inKey.has(x.pc)).length / corrected.length) * 100)
    : undefined;

  return {
    label,
    kind,
    notes: h.length,
    score,
    close,
    off,
    typical,
    lean,
    ...(right_notes !== undefined ? { right_notes } : {}),
    verdict: verdictFor(score, off),
    tendencies,
    by_note,
  };
}

function within(notes: Note[], ranges: { start: number; end: number }[]): Note[] {
  return notes.filter((n) => ranges.some((r) => n.start >= r.start - 0.05 && n.end <= r.end + 0.05));
}

const TONICS: Record<string, number> = {
  C: 0, "C#": 1, Db: 1, D: 2, Eb: 3, "D#": 3, E: 4, F: 5, "F#": 6, Gb: 6, G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11,
};

/** Intonation for the session overall and for each scale or arpeggio found. */
export function sessionIntonation(notes: Note[], instrument: string, scales: ScaleSummary[]): SessionIntonation | null {
  if (!checksIntonation(instrument)) return null;
  const { offset, from } = tuning(notes, instrument);
  const overall = groupOf("Whole session", "session", notes, offset);
  if (!overall) return null;
  const groups: IntonationGroup[] = [];
  for (const s of scales) {
    const label = `${s.key} ${s.kind}`;
    const tonic = TONICS[s.key.split(" ")[0]];
    const g = groupOf(label, s.kind, within(notes, s.when), offset, tonic, tonic === undefined ? undefined : keyPitchClasses(s, tonic));
    if (g) groups.push(g);
  }
  return {
    v: INTONATION_VERSION,
    offset,
    offset_from: from,
    score: overall.score,
    notes: overall.notes,
    verdict: overall.verdict,
    close: overall.close,
    off: overall.off,
    typical: overall.typical,
    lean: overall.lean,
    tendencies: overall.tendencies,
    by_note: overall.by_note,
    groups,
  };
}

/**
 * After Claude has labelled the session's stretches, adds one group per
 * known piece (matched by title in the label), so each piece gets its own
 * verdict and can be followed from session to session.
 */
export function addPieceGroups(
  into: SessionIntonation,
  notes: Note[],
  timeline: { start: string; end: string; label: string }[],
  titles: string[],
): SessionIntonation {
  const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const known = titles.map((t) => ({ title: t, n: norm(t) })).filter((t) => t.n.length >= 3);
  const ranges = new Map<string, { start: number; end: number }[]>();
  for (const e of timeline) {
    const l = norm(e.label);
    if (/\b(scale|scales|arpeggio|arpeggios)\b/.test(l)) continue;
    const match = known.find((k) => l.includes(k.n));
    const start = parseClock(e.start);
    const end = parseClock(e.end);
    if (!match || start === null || end === null || end <= start) continue;
    ranges.set(match.title, [...(ranges.get(match.title) ?? []), { start, end: end + 1 }]);
  }
  const pieces: IntonationGroup[] = [];
  for (const [title, r] of ranges) {
    const g = groupOf(title, "piece", within(notes, r), into.offset);
    if (g) pieces.push(g);
  }
  return { ...into, groups: [...into.groups.filter((g) => g.kind !== "piece"), ...pieces] };
}

function parseClock(s: string): number | null {
  const parts = s.trim().split(":").map(Number);
  if (!parts.length || parts.some((p) => !Number.isFinite(p))) return null;
  return parts.reduce((acc, p) => acc * 60 + p, 0);
}

/**
 * Stretches of playing between pauses, each with its intonation, so Claude
 * can say which piece the shaky stretch was.
 */
export function stretchLines(notes: Note[], offset: number): string[] {
  const out: string[] = [];
  let cur: Note[] = [];
  const flush = () => {
    const g = groupOf("", "session", cur, offset);
    if (g) {
      const lean = g.tendencies.map((t) => `${t.note} ${signedCents(t.cents)}`).join(", ");
      out.push(
        `${clock(cur[0].start)}-${clock(cur[cur.length - 1].end)}: ${g.notes} held notes, ${g.score}% within ${IN_TUNE_CENTS}c, ${g.off}% beyond ${CLEAR_CENTS}c, typical miss ${g.typical}c (${verdictText(g.verdict)})${lean ? `; leaning: ${lean}` : ""}`,
      );
    }
    cur = [];
  };
  for (const n of notes) {
    const last = cur[cur.length - 1];
    if (last && n.start - last.end > 3) flush();
    cur.push(n);
  }
  if (cur.length) flush();
  return out.slice(0, 40);
}

/** "B (3rd) +12 sharp" */
export function tendencyText(t: IntonationGroup["tendencies"][number]): string {
  return `${t.note}${t.degree ? ` (${t.degree})` : ""} ${signedCents(t.cents)} ${t.cents > 0 ? "sharp" : "flat"}`;
}

/** "B (3rd) is clearly flat" in words, for the family. */
export function tendencyWords(t: IntonationGroup["tendencies"][number]): string {
  return `${t.note}${t.degree ? ` (${t.degree})` : ""} ${centsWords(t.cents)}`;
}

function groupLine(g: Pick<IntonationGroup, "notes" | "score" | "close" | "off" | "typical" | "lean" | "verdict" | "tendencies" | "right_notes" | "by_note">): string {
  const parts = [
    `${g.notes} held notes`,
    ...(g.right_notes !== undefined ? [`right notes ${g.right_notes}%`] : []),
    `in tune (within ${IN_TUNE_CENTS}c) ${g.score}%`,
    `within ${SLIGHT_CENTS}c ${g.close}%`,
    `beyond ${CLEAR_CENTS}c ${g.off}%`,
    `typical miss ${g.typical}c`,
    `overall lean ${signedCents(g.lean ?? 0)}c`,
    `verdict: ${verdictText(g.verdict)}`,
  ];
  const lean = g.tendencies.length ? `; leaning notes: ${g.tendencies.map(tendencyText).join(", ")}` : "";
  const notes = g.by_note?.length
    ? `; by note (median cents, % in tune): ${g.by_note.map((n) => `${n.note} ${signedCents(n.cents)} ${n.in_tune}%`).join(", ")}`
    : "";
  return parts.join(", ") + lean + notes;
}

/** The intonation summary as text for Claude. */
export function intonationText(i: SessionIntonation, notes: Note[]): string {
  const lines = [
    i.offset_from === "open strings"
      ? `Tuning: the open strings sit ${Math.abs(i.offset)} cents ${i.offset >= 0 ? "above" : "below"} A=440; notes are judged against that tuning.`
      : `Tuning: too few open strings to read the instrument's tuning, so notes are judged against A=440 as they are.`,
    `Scale (strict, a teacher's ear): within ${IN_TUNE_CENTS} cents = in tune, ${IN_TUNE_CENTS + 1}-${SLIGHT_CENTS} slightly off, ${SLIGHT_CENTS + 1}-${CLEAR_CENTS} clearly off, beyond ${CLEAR_CENTS} out of tune. Only notes held a quarter second or more are judged. "Right notes" (the note named is the one in the key) is separate from "in tune".`,
    `Whole session: ${groupLine(i as unknown as IntonationGroup)}${i.prev_score !== undefined ? `; last time (${i.prev_date}) ${i.prev_score}% in tune` : ""}.`,
  ];
  for (const g of i.groups)
    lines.push(`${g.label}: ${groupLine(g)}${g.prev_score !== undefined ? `; last time (${g.prev_date}) ${g.prev_score}% in tune` : ""}.`);
  const stretches = stretchLines(notes, i.offset);
  if (stretches.length) lines.push(`By stretch of playing:\n${stretches.join("\n")}`);
  return lines.join("\n");
}

/** Fills in each group's score from the most recent earlier session that had the same group. */
export function withPrevious(
  i: SessionIntonation,
  earlier: { date: string; intonation: SessionIntonation }[],
): SessionIntonation {
  // Scores on the old lenient scale aren't comparable.
  const sameScale = earlier.filter((e) => (e.intonation.v ?? 1) === (i.v ?? 1));
  const prevOf = (label: string) => {
    for (const e of sameScale) {
      const g = label === "Whole session" ? { score: e.intonation.score } : e.intonation.groups.find((x) => x.label === label);
      if (g) return { prev_score: g.score, prev_date: e.date };
    }
    return {};
  };
  const whole = prevOf("Whole session");
  return {
    ...i,
    ...(whole.prev_score !== undefined ? { prev_score: whole.prev_score, prev_date: whole.prev_date } : {}),
    groups: i.groups.map((g) => ({ ...g, ...prevOf(g.label) })),
  };
}


export type IntonationTrendRow = { label: string; points: { date: string; score: number; verdict: IntonationVerdict }[] };

/**
 * Intonation over several sessions, one row per scale or piece (and the
 * whole session first), oldest session first.
 */
export function intonationTrend(
  sessions: { practice_date: string; started_at: string; intonation?: SessionIntonation }[],
): IntonationTrendRow[] {
  const rows = new Map<string, IntonationTrendRow>();
  const add = (label: string, date: string, score: number, verdict: IntonationVerdict) => {
    const row = rows.get(label) ?? { label, points: [] };
    row.points.push({ date, score, verdict });
    rows.set(label, row);
  };
  const ordered = [...sessions].sort((a, b) => a.started_at.localeCompare(b.started_at));
  for (const s of ordered) {
    const i = s.intonation;
    // Old lenient-scale results aren't comparable with the strict scale.
    if (!i || (i.v ?? 1) < INTONATION_VERSION) continue;
    add("Whole session", s.practice_date, i.score, i.verdict);
    for (const g of i.groups) add(g.label, s.practice_date, g.score, g.verdict);
  }
  return [...rows.values()];
}
