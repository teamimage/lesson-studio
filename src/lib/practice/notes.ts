// Turns the sound timeline of a practice session into separate notes: which
// note, when it started, how long it lasted and (when the phone saved the
// fine pitch readings) how sharp or flat it was. Scale recognition and the
// intonation check both work from this list. Pure code, no AI.

import type { ActivitySecond } from "./activity";

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export type Note = {
  /** MIDI note number (60 = middle C). */
  midi: number;
  /** Seconds from the start of the session. */
  start: number;
  end: number;
  /** Pitch readings that made up the note (0 for older sessions without them). */
  frames: number;
  /** Middle reading in cents from equal temperament at A=440, + sharp / - flat. */
  cents?: number;
};

export function noteName(midi: number): string {
  return `${NOTE_NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}

export function pitchClassName(pc: number): string {
  return NOTE_NAMES[((pc % 12) + 12) % 12];
}

export function midiOf(name: string): number | null {
  const m = /^([A-G])(#|b)?(-?\d)$/.exec(name.trim());
  if (!m) return null;
  const base = NOTE_NAMES.indexOf(m[1]);
  const acc = m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0;
  return (Number(m[3]) + 1) * 12 + base + acc;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

type Frame = { t: number; m: number | null };

/** The fine readings (`p`) spread evenly across each second. */
function framesOf(activity: ActivitySecond[]): Frame[] {
  const out: Frame[] = [];
  for (const s of activity) {
    const p = s.p ?? [];
    for (let i = 0; i < p.length; i++) out.push({ t: s.t + i / p.length, m: p[i] > 0 ? p[i] / 100 : null });
  }
  return out;
}

/**
 * Notes from the fine pitch readings (about 20 a second). A single reading
 * that jumps away from both neighbours (an octave slip, a squeak) is
 * dropped; a one-reading gap inside a note is bridged; notes shorter than
 * two readings are dropped. Each note's cents are the middle reading after
 * the first one, so the attack and any vibrato don't skew it.
 */
function notesFromFrames(frames: Frame[]): Note[] {
  const f = frames.map((x) => ({ ...x }));
  for (let i = 1; i < f.length - 1; i++) {
    const a = f[i - 1].m;
    const b = f[i].m;
    const c = f[i + 1].m;
    if (a === null || b === null || c === null) continue;
    if (Math.abs(a - c) < 0.6 && Math.abs(b - a) > 0.6 && Math.abs(b - c) > 0.6) f[i].m = null;
  }

  const notes: Note[] = [];
  let cur: { midi: number; start: number; end: number; readings: number[] } | null = null;
  let gap = 0;
  const close = () => {
    if (cur && cur.readings.length >= 2) {
      const r = cur.readings.length >= 3 ? cur.readings.slice(1) : cur.readings;
      notes.push({
        midi: cur.midi,
        start: round2(cur.start),
        end: round2(cur.end),
        frames: cur.readings.length,
        cents: Math.round(median(r.map((m) => (m - cur!.midi) * 100))),
      });
    }
    cur = null;
  };
  for (const x of f) {
    if (x.m === null) {
      gap++;
      if (gap >= 2) close();
      continue;
    }
    gap = 0;
    const midi = Math.round(x.m);
    if (cur && cur.midi === midi) {
      cur.readings.push(x.m);
      cur.end = x.t + 0.05;
    } else {
      close();
      cur = { midi, start: x.t, end: x.t + 0.05, readings: [x.m] };
    }
  }
  close();
  return notes;
}

/** Older sessions only kept note names per second: one rough note per name. */
function notesFromNames(activity: ActivitySecond[]): Note[] {
  const out: Note[] = [];
  for (const s of activity) {
    const names = s.n ?? [];
    names.forEach((n, i) => {
      const midi = midiOf(n);
      if (midi === null) return;
      const start = s.t + i / names.length;
      const prev = out[out.length - 1];
      if (prev && prev.midi === midi && start - prev.end < 0.6) prev.end = s.t + (i + 1) / names.length;
      else out.push({ midi, start: round2(start), end: round2(s.t + (i + 1) / names.length), frames: 0 });
    });
  }
  return out;
}

export function hasFineReadings(activity: ActivitySecond[]): boolean {
  return activity.some((s) => (s.p?.length ?? 0) > 0);
}

export function extractNotes(activity: ActivitySecond[]): Note[] {
  return hasFineReadings(activity) ? notesFromFrames(framesOf(activity)) : notesFromNames(activity);
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
