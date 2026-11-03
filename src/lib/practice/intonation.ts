// A coarse intonation check for a practice session: for each scale and
// piece, how many held notes were in tune, a plain verdict ("sounding
// good" / "mostly good" / "needs work") and the notes that lean sharp or
// flat again and again. Pure code, no AI. Claude only reads the summary.
//
// Pitches are measured against equal temperament at A=440, then shifted by
// the instrument's own tuning: a cello tuned a little low shouldn't make
// every note "flat". The shift comes from the open-string notes when there
// are enough of them (they ring true to however the instrument is tuned),
// otherwise from the middle of all the notes.

import { clock } from "./activity";
import { pitchClassName, type Note } from "./notes";
import type { ScaleSummary } from "./scales";
import type { IntonationGroup, IntonationVerdict, SessionIntonation } from "./review-types";

/** Fixed-pitch instruments: nothing for the player to tune. */
const FIXED_PITCH = new Set(["piano", "organ", "harp", "guitar", "mandolin"]);

/** Open strings (MIDI) for the string instruments. */
const OPEN_STRINGS: Record<string, number[]> = {
  cello: [36, 43, 50, 57],
  viola: [48, 55, 62, 69],
  violin: [55, 62, 69, 76],
  bass: [28, 33, 38, 43],
};

/** Within this many cents of the tuning counts as in tune. */
export const IN_TUNE_CENTS = 20;
/** A note that leans this far, the same way, on average is a tendency. */
const LEAN_CENTS = 15;
/** Fewer held notes than this and there's no verdict. */
const MIN_NOTES = 8;

const DEGREES = ["1st", "", "2nd", "3rd", "3rd", "4th", "", "5th", "6th", "6th", "7th", "7th"];

export function checksIntonation(instrument: string): boolean {
  return !FIXED_PITCH.has(instrument);
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Held notes with a pitch measurement (three readings or more). */
function held(notes: Note[]): (Note & { cents: number })[] {
  return notes.filter((n): n is Note & { cents: number } => n.cents !== undefined && n.frames >= 3);
}

/** How far the instrument's tuning sits from A=440, in cents. */
export function tuningOffset(notes: Note[], instrument: string): number {
  const h = held(notes);
  const open = OPEN_STRINGS[instrument];
  const openNotes = open ? h.filter((n) => open.includes(n.midi) && n.frames >= 4) : [];
  const basis = openNotes.length >= 6 ? openNotes : h.length >= 20 ? h : [];
  if (!basis.length) return 0;
  return Math.max(-35, Math.min(35, Math.round(median(basis.map((n) => n.cents)))));
}

export function verdictFor(score: number): IntonationVerdict {
  return score >= 75 ? "good" : score >= 55 ? "fair" : "needs work";
}

export function verdictText(v: IntonationVerdict): string {
  return v === "good" ? "sounding good" : v === "fair" ? "mostly good" : "needs work";
}

/**
 * In-tune share and leaning notes for a set of notes. `tonic` (pitch
 * class) names the leaning notes by scale degree too.
 */
function groupOf(
  label: string,
  kind: IntonationGroup["kind"],
  notes: Note[],
  offset: number,
  tonic?: number,
): IntonationGroup | null {
  const h = held(notes);
  if (h.length < MIN_NOTES) return null;
  const corrected = h.map((n) => ({ pc: ((n.midi % 12) + 12) % 12, c: n.cents - offset }));
  const inTune = corrected.filter((x) => Math.abs(x.c) <= IN_TUNE_CENTS).length;
  const score = Math.round((inTune / corrected.length) * 100);

  const byPc = new Map<number, number[]>();
  for (const x of corrected) byPc.set(x.pc, [...(byPc.get(x.pc) ?? []), x.c]);
  const tendencies = [...byPc.entries()]
    .filter(([, cs]) => cs.length >= 3)
    .map(([pc, cs]) => ({ pc, cents: Math.round(median(cs)) }))
    .filter((t) => Math.abs(t.cents) >= LEAN_CENTS)
    .sort((a, b) => Math.abs(b.cents) - Math.abs(a.cents))
    .slice(0, 3)
    .map((t) => {
      const degree = tonic === undefined ? "" : DEGREES[(t.pc - tonic + 12) % 12];
      return { note: pitchClassName(t.pc), ...(degree ? { degree } : {}), cents: t.cents };
    });

  return { label, kind, notes: h.length, score, verdict: verdictFor(score), tendencies };
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
  const offset = tuningOffset(notes, instrument);
  const overall = groupOf("Whole session", "session", notes, offset);
  if (!overall) return null;
  const groups: IntonationGroup[] = [];
  for (const s of scales) {
    const label = `${s.key} ${s.kind}`;
    const g = groupOf(label, s.kind, within(notes, s.when), offset, TONICS[s.key.split(" ")[0]]);
    if (g) groups.push(g);
  }
  return { offset, score: overall.score, notes: overall.notes, verdict: overall.verdict, tendencies: overall.tendencies, groups };
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
      const lean = g.tendencies.map((t) => `${t.note} ${Math.abs(t.cents)} cents ${t.cents > 0 ? "sharp" : "flat"}`).join(", ");
      out.push(
        `${clock(cur[0].start)}-${clock(cur[cur.length - 1].end)}: ${g.notes} held notes, ${g.score}% in tune (${verdictText(g.verdict)})${lean ? `; leaning: ${lean}` : ""}`,
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

/** "B (3rd) tends flat" */
export function tendencyText(t: IntonationGroup["tendencies"][number]): string {
  return `${t.note}${t.degree ? ` (${t.degree})` : ""} tends ${t.cents > 0 ? "sharp" : "flat"}`;
}

/** The intonation summary as text for Claude. */
export function intonationText(i: SessionIntonation, notes: Note[]): string {
  const lines = [
    `Tuning: the instrument sits ${Math.abs(i.offset)} cents ${i.offset >= 0 ? "above" : "below"} A=440; notes are judged against its own tuning. A held note within ${IN_TUNE_CENTS} cents counts as in tune.`,
    `Whole session: ${i.notes} held notes, ${i.score}% in tune (${verdictText(i.verdict)})${i.tendencies.length ? `; ${i.tendencies.map(tendencyText).join(", ")}` : ""}.`,
  ];
  for (const g of i.groups)
    lines.push(
      `${g.label}: ${g.notes} held notes, ${g.score}% in tune (${verdictText(g.verdict)})${g.tendencies.length ? `; ${g.tendencies.map(tendencyText).join(", ")}` : ""}${g.prev_score !== undefined ? `; last time (${g.prev_date}) ${g.prev_score}%` : ""}.`,
    );
  const stretches = stretchLines(notes, i.offset);
  if (stretches.length) lines.push(`By stretch of playing:\n${stretches.join("\n")}`);
  return lines.join("\n");
}

/** Fills in each group's score from the most recent earlier session that had the same group. */
export function withPrevious(
  i: SessionIntonation,
  earlier: { date: string; intonation: SessionIntonation }[],
): SessionIntonation {
  const prevOf = (label: string) => {
    for (const e of earlier) {
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
    if (!i) continue;
    add("Whole session", s.practice_date, i.score, i.verdict);
    for (const g of i.groups) add(g.label, s.practice_date, g.score, g.verdict);
  }
  return [...rows.values()];
}
