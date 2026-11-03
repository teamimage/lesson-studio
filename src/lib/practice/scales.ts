// Finds scales and arpeggios in a practice session from the notes alone,
// with no sheet music loaded: "G major scale, 2 octaves, up and down, 3
// times". Pure code, runs before Claude so the review doesn't depend on
// Claude reading a long list of note names.
//
// A scale is a run of steps (1 or 2 semitones) in one direction covering
// at least an octave; an arpeggio is a run of chord-tone leaps (3 to 5
// semitones) covering at least an octave. The key comes from which notes
// were used, with the tonic taken from the bottom (or top) note, which is
// where scales start and end. Runs of the same key that follow each other
// (up, then down, then up again) are one stretch of practice.

import { noteName, pitchClassName, type Note } from "./notes";

export type ScaleKind = "scale" | "arpeggio";

export type ScaleFinding = {
  kind: ScaleKind;
  /** "G major", "D minor". */
  key: string;
  /** "harmonic" / "melodic" / "natural" for minor scales. */
  variant?: string;
  octaves: number;
  /** How many times it was played (an up-and-down counts once). */
  times: number;
  up: boolean;
  down: boolean;
  /** Seconds from the start of the session. */
  start: number;
  end: number;
  /** Bottom note, e.g. "G2". */
  low: string;
  /** Notes outside the key that came up inside the run, e.g. ["C#"]. */
  off_notes: string[];
};

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINORS: { variant: string; steps: number[] }[] = [
  { variant: "harmonic", steps: [0, 2, 3, 5, 7, 8, 11] },
  { variant: "melodic", steps: [0, 2, 3, 5, 7, 9, 11] },
  { variant: "natural", steps: [0, 2, 3, 5, 7, 8, 10] },
];
const MAJOR_TONIC = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
const MINOR_TONIC = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "G#", "A", "Bb", "B"];

/** A phrase is broken by a pause longer than this (seconds). */
const PHRASE_GAP = 2;
/** Up and down runs of one scale are joined across pauses up to this. */
const JOIN_GAP = 4;

type Pt = { midi: number; start: number; end: number };
type Run = { kind: ScaleKind; dir: 1 | -1; pts: Pt[]; strays: number };

/** Repeated notes (re-bowing, a held note split in two) become one point. */
function points(notes: Note[]): Pt[][] {
  const phrases: Pt[][] = [];
  let cur: Pt[] = [];
  for (const n of notes) {
    const last = cur[cur.length - 1];
    if (last && n.start - last.end > PHRASE_GAP) {
      phrases.push(cur);
      cur = [];
    }
    const prev = cur[cur.length - 1];
    if (prev && prev.midi === n.midi) prev.end = n.end;
    else cur.push({ midi: n.midi, start: n.start, end: n.end });
  }
  if (cur.length) phrases.push(cur);
  return phrases;
}

function fits(kind: ScaleKind, interval: number, dir: number): boolean {
  const d = interval * dir;
  return kind === "scale" ? d === 1 || d === 2 : d >= 3 && d <= 5;
}

/**
 * Longest one-direction runs of steps (or leaps) in a phrase. One stray
 * note is skipped when the next note carries on the pattern, so a squeak
 * or a wrong reading doesn't cut a scale in half.
 */
function runsIn(phrase: Pt[], kind: ScaleKind): Run[] {
  const runs: Run[] = [];
  let i = 0;
  while (i < phrase.length - 1) {
    const first = phrase[i + 1].midi - phrase[i].midi;
    const dir: 1 | -1 = first > 0 ? 1 : -1;
    if (!fits(kind, first, dir)) {
      i++;
      continue;
    }
    const pts = [phrase[i], phrase[i + 1]];
    let strays = 0;
    let j = i + 1;
    while (j < phrase.length - 1) {
      const next = phrase[j + 1].midi - phrase[j].midi;
      if (fits(kind, next, dir)) {
        pts.push(phrase[j + 1]);
        j++;
        continue;
      }
      if (j + 2 < phrase.length && strays < Math.max(1, Math.floor(pts.length / 6)) && fits(kind, phrase[j + 2].midi - phrase[j].midi, dir)) {
        strays++;
        pts.push(phrase[j + 2]);
        j += 2;
        continue;
      }
      break;
    }
    runs.push({ kind, dir, pts, strays });
    // The turning note starts the next run (top of the scale, then down).
    i = j;
  }
  return runs;
}

type Key = { name: string; tonic: number; mode: "major" | "minor"; variant?: string; pcs: number[]; outside: number[] };

function keyFor(kind: ScaleKind, pts: Pt[]): Key | null {
  const notes = pts.map((p) => ((p.midi % 12) + 12) % 12);
  const pcs = [...new Set(notes)];
  const low = Math.min(...pts.map((p) => p.midi));
  const high = Math.max(...pts.map((p) => p.midi));
  const ends = [((low % 12) + 12) % 12, ((high % 12) + 12) % 12];
  const allowedOutside = kind === "scale" && pts.length >= 8 ? 1 : 0;

  const candidates: { tonic: number; mode: "major" | "minor"; variant?: string; steps: number[] }[] = [];
  for (const tonic of ends) {
    if (kind === "scale") {
      candidates.push({ tonic, mode: "major", steps: MAJOR });
      for (const m of MINORS) candidates.push({ tonic, mode: "minor", variant: m.variant, steps: m.steps });
    } else {
      candidates.push({ tonic, mode: "major", steps: [0, 4, 7] });
      candidates.push({ tonic, mode: "minor", steps: [0, 3, 7] });
    }
  }
  let best: (Key & { score: number }) | null = null;
  for (const c of candidates) {
    const set = new Set(c.steps.map((s) => (c.tonic + s) % 12));
    const outsideNotes = notes.filter((pc) => !set.has(pc)).length;
    if (outsideNotes > allowedOutside) continue;
    // An arpeggio must use the root, third and fifth; a scale most of its notes.
    const used = c.steps.filter((s) => pcs.includes((c.tonic + s) % 12)).length;
    if (kind === "arpeggio" && used < 3) continue;
    if (kind === "scale" && used < 6) continue;
    // Prefer the tonic at the bottom, no wrong notes, and major over minor.
    const score =
      (c.tonic === ends[0] ? 4 : 0) - outsideNotes * 3 + (c.mode === "major" ? 1 : 0) + (c.variant === "harmonic" ? 0.5 : 0);
    if (!best || score > best.score) {
      const tonicName = (c.mode === "major" ? MAJOR_TONIC : MINOR_TONIC)[c.tonic];
      best = {
        name: `${tonicName} ${c.mode}`,
        tonic: c.tonic,
        mode: c.mode,
        variant: c.variant,
        pcs: [...set],
        outside: [...new Set(notes.filter((pc) => !set.has(pc)))],
        score,
      };
    }
  }
  return best;
}

type Hit = { kind: ScaleKind; key: Key; dir: 1 | -1; range: number; start: number; end: number; low: number };

function hitsIn(phrase: Pt[]): Hit[] {
  const out: Hit[] = [];
  for (const kind of ["scale", "arpeggio"] as const) {
    for (const r of runsIn(phrase, kind)) {
      const mids = r.pts.map((p) => p.midi);
      const range = Math.max(...mids) - Math.min(...mids);
      // An octave or more (a scale may stop on the leading note a semitone short).
      if (range < (kind === "scale" ? 11 : 12)) continue;
      if (kind === "arpeggio" && r.pts.length < 4) continue;
      if (kind === "scale" && r.pts.length < 7) continue;
      const key = keyFor(kind, r.pts);
      if (!key) continue;
      out.push({
        kind,
        key,
        dir: r.dir,
        range,
        start: r.pts[0].start,
        end: r.pts[r.pts.length - 1].end,
        low: Math.min(...mids),
      });
    }
  }
  return out;
}

/** All the scales and arpeggios heard, in the order they were played. */
export function findScales(notes: Note[]): ScaleFinding[] {
  const hits = points(notes)
    .flatMap(hitsIn)
    .sort((a, b) => a.start - b.start);

  const out: (ScaleFinding & { ups: number; downs: number })[] = [];
  for (const h of hits) {
    const last = [...out].reverse().find((f) => f.kind === h.kind);
    const variant = h.kind === "scale" && h.key.mode === "minor" ? h.key.variant : undefined;
    const octaves = Math.max(1, Math.round(h.range / 12));
    if (last && last.key === h.key.name && h.start - last.end <= JOIN_GAP) {
      if (h.dir === 1) last.ups++;
      else last.downs++;
      last.end = Math.max(last.end, h.end);
      last.octaves = Math.max(last.octaves, octaves);
      last.up ||= h.dir === 1;
      last.down ||= h.dir === -1;
      last.times = Math.max(last.ups, last.downs);
      last.off_notes = [...new Set([...last.off_notes, ...h.key.outside.map(pitchClassName)])];
      if (variant && !last.variant) last.variant = variant;
      if (h.low < (midiFromName(last.low) ?? h.low)) last.low = noteName(h.low);
      continue;
    }
    out.push({
      kind: h.kind,
      key: h.key.name,
      ...(variant ? { variant } : {}),
      octaves,
      times: 1,
      ups: h.dir === 1 ? 1 : 0,
      downs: h.dir === -1 ? 1 : 0,
      up: h.dir === 1,
      down: h.dir === -1,
      start: h.start,
      end: h.end,
      low: noteName(h.low),
      off_notes: h.key.outside.map(pitchClassName),
    });
  }
  for (const f of out) {
    delete (f as Partial<typeof f>).ups;
    delete (f as Partial<typeof f>).downs;
  }
  return out;
}

function midiFromName(name: string): number | null {
  const m = /^([A-G]#?)(-?\d)$/.exec(name);
  if (!m) return null;
  const pc = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"].indexOf(m[1]);
  return (Number(m[2]) + 1) * 12 + pc;
}

export type ScaleSummary = {
  kind: ScaleKind;
  key: string;
  variant?: string;
  octaves: number;
  times: number;
  seconds: number;
  /** "0:12-1:40" stretches. */
  when: { start: number; end: number }[];
  off_notes: string[];
};

/** One line per key and kind: "G major scale, 2 octaves, 3 times". */
export function summarizeScales(found: ScaleFinding[]): ScaleSummary[] {
  const groups = new Map<string, ScaleSummary>();
  for (const f of found) {
    const id = `${f.kind}|${f.key}`;
    const g = groups.get(id);
    if (g) {
      g.times += f.times;
      g.octaves = Math.max(g.octaves, f.octaves);
      g.seconds += f.end - f.start;
      g.when.push({ start: f.start, end: f.end });
      g.off_notes = [...new Set([...g.off_notes, ...f.off_notes])];
      if (f.variant && !g.variant) g.variant = f.variant;
    } else {
      groups.set(id, {
        kind: f.kind,
        key: f.key,
        ...(f.variant ? { variant: f.variant } : {}),
        octaves: f.octaves,
        times: f.times,
        seconds: f.end - f.start,
        when: [{ start: f.start, end: f.end }],
        off_notes: f.off_notes,
      });
    }
  }
  return [...groups.values()].map((g) => ({ ...g, seconds: Math.round(g.seconds) }));
}

export function scaleLabel(s: Pick<ScaleSummary, "kind" | "key" | "variant">): string {
  return `${s.key} ${s.kind}${s.variant ? ` (${s.variant})` : ""}`;
}

/** "G major scale · 2 octaves · 3×" for the review card. */
export function scaleLine(s: ScaleSummary): string {
  return `${scaleLabel(s)} · ${s.octaves} octave${s.octaves === 1 ? "" : "s"} · ${s.times}×`;
}
