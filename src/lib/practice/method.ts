// How a piece was practised, not just whether: every attempt at it (where
// the student started, where they stopped, how fast), where stops cluster,
// whether a hard spot was isolated and looped, whether the tempo came down,
// and whether the student then got through. Pure code over the notes and the
// melody Claude read from the uploaded music (scores.melody); no AI.
//
// Thresholds are first guesses, set from how teachers describe practice, and
// still need checking against real sessions.

import type { Note } from "./notes";
import { melodySeq, type MelodySource, type MusicMatch } from "@/lib/melody";

export type Attempt = {
  /** Seconds from the start of the session. */
  start: number;
  end: number;
  from_bar: number;
  to_bar: number;
  /** Seconds per bar; missing for attempts under two bars. */
  sec_per_bar?: number;
  /** Beats per minute, when the time signature is known. */
  bpm?: number;
  /** Got to (or within a bar of) the last bar of the piece. */
  reached_end: boolean;
  /** Short loop on a spot that doesn't start at the top. */
  drill: boolean;
  /** Stopped before the end, then went back to an earlier bar. */
  stalled: boolean;
};

export type DrillSpot = { from_bar: number; to_bar: number; times: number; slower: boolean };

export type MethodVerdict =
  /** Slowed down or isolated the spot, then got through. */
  | "good_method"
  /** Kept starting again and stopping, without slowing down or working on the spot. */
  | "stuck_restarting"
  /** Worked on a spot but never got through the passage afterwards. */
  | "drilled_not_through"
  /** Played straight through again and again: review, not spot work. */
  | "run_throughs"
  | "mixed"
  | "single";

export type PieceMethod = {
  title: string;
  first_bar: number;
  last_bar: number;
  attempts: Attempt[];
  /** Attempts that started at the top and reached the end. */
  completed: number;
  starts_from_top: number;
  furthest_bar: number;
  /** Bars where attempts stopped and went back, most first. */
  stall_bars: { bar: number; times: number }[];
  drills: DrillSpot[];
  /** Some later attempt or loop was clearly slower than the first full try. */
  slowed: boolean;
  /** After slowing down or working a spot, an attempt got through it. */
  through_after_work: boolean;
  verdict: MethodVerdict;
};

/** Longest gap inside one attempt before it counts as stopped. */
const MAX_GAP = 6;
/** A pause this long before going back counts as a stop. */
const STOP_GAP = 1;
/** Loops of this many bars or fewer that don't start at the top are spot work. */
const DRILL_BARS = 4;
/** 20% slower than the first full try counts as slowing down. */
const SLOWER = 1.2;
const GRAM = 5;

type Occ = { from: number; to: number };
type Hit = { t: number; tEnd: number; occs: Occ[] };

function beatsPerBar(timeSig: string | undefined): number | null {
  const m = /^(\d+)\s*\/\s*(\d+)$/.exec(timeSig?.trim() ?? "");
  if (!m) return null;
  const n = Number(m[1]);
  const d = Number(m[2]);
  if (!n || !d) return null;
  // Compound time (6/8, 9/8, 12/8) is felt in dotted beats.
  if (d === 8 && n % 3 === 0 && n > 3) return n / 3;
  return n;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Works out the attempts at each piece code matched in the session. `skip`
 * drops the stretches already explained as scales.
 */
export function practiceMethod(
  notes: Note[],
  sources: MelodySource[],
  matches: MusicMatch[],
  skip: { start: number; end: number }[] = [],
): PieceMethod[] {
  const played: { pc: number; t: number; tEnd: number }[] = [];
  for (const n of notes) {
    if (skip.some((r) => n.start >= r.start - 0.5 && n.end <= r.end + 0.5)) continue;
    const pc = ((n.midi % 12) + 12) % 12;
    const last = played[played.length - 1];
    if (last && last.pc === pc) {
      last.tEnd = n.end;
      continue;
    }
    played.push({ pc, t: n.start, tEnd: n.end });
  }

  const out: PieceMethod[] = [];
  const titles = [...new Set(matches.map((m) => m.title))];
  for (const title of titles) {
    const src = sources.find((s) => s.section.display === title);
    if (!src) continue;
    const windows = matches.filter((m) => m.title === title);
    const method = pieceMethod(src, played, windows);
    if (method) out.push(method);
  }
  return out;
}

function pieceMethod(
  src: MelodySource,
  played: { pc: number; t: number; tEnd: number }[],
  windows: MusicMatch[],
): PieceMethod | null {
  const seq = melodySeq(src.section);
  const barNums = src.section.bars.map((b) => b.bar);
  if (seq.length < GRAM || !barNums.length) return null;
  const firstBar = Math.min(...barNums);
  const lastBar = Math.max(...barNums);
  const beats = beatsPerBar(src.section.time_signature);

  const index = new Map<string, Occ[]>();
  for (let i = 0; i + GRAM <= seq.length; i++) {
    const key = seq
      .slice(i, i + GRAM)
      .map((x) => x.pc)
      .join(",");
    const list = index.get(key) ?? [];
    list.push({ from: seq[i].bar, to: seq[i + GRAM - 1].bar });
    index.set(key, list);
  }

  const hits: Hit[] = [];
  for (let i = 0; i + GRAM <= played.length; i++) {
    const t = played[i].t;
    if (!windows.some((w) => t >= w.start - 5 && t <= w.end + 5)) continue;
    const key = played
      .slice(i, i + GRAM)
      .map((x) => x.pc)
      .join(",");
    const occs = index.get(key);
    if (occs) hits.push({ t, tEnd: played[i + GRAM - 1].tEnd, occs });
  }
  if (hits.length < 2) return null;

  // The next pattern carries on from one that began in bar `at`: it begins
  // in the same bar or up to a few bars on (patterns missed to wrong notes).
  const follows = (h: Hit, at: number): Occ | undefined =>
    h.occs.filter((x) => x.from >= at && x.from <= at + 3).sort((a, b) => a.from - b.from)[0];

  // Where a new attempt starts: the place that the next few patterns follow on from best.
  const pickStart = (k: number): Occ => {
    let best = hits[k].occs[0];
    let bestScore = -1;
    for (const o of hits[k].occs) {
      let score = 0;
      let at = o.from;
      for (const h of hits.slice(k + 1, k + 6)) {
        const next = follows(h, at);
        if (!next) break;
        score++;
        at = next.from;
      }
      if (score > bestScore || (score === bestScore && o.from < best.from)) {
        best = o;
        bestScore = score;
      }
    }
    return best;
  };

  type Raw = { start: number; end: number; from: number; to: number; at: number; hits: number; gapAfter: number };
  const raw: Raw[] = [];
  let cur: Raw | null = null;
  hits.forEach((h, k) => {
    if (cur) {
      const gap = h.t - cur.end;
      const next = follows(h, cur.at);
      if (next && gap <= MAX_GAP) {
        cur.at = next.from;
        cur.to = Math.max(cur.to, next.to);
        cur.end = Math.max(cur.end, h.tEnd);
        cur.hits++;
        return;
      }
      cur.gapAfter = gap;
      raw.push(cur);
    }
    const o = pickStart(k);
    cur = { start: h.t, end: h.tEnd, from: o.from, to: o.to, at: o.from, hits: 1, gapAfter: Infinity };
  });
  if (cur) raw.push(cur);

  // A single matching pattern on its own is too thin to call an attempt.
  const kept = raw.filter((a) => a.hits >= 2);
  if (!kept.length) return null;
  const furthest = Math.max(...kept.map((a) => a.to));

  const attempts: Attempt[] = kept.map((a, i) => {
    const bars = a.to - a.from + 1;
    const secPerBar = bars >= 2 ? Math.round(((a.end - a.start) / bars) * 10) / 10 : undefined;
    const reached = a.to >= lastBar - 1;
    const drill = bars <= DRILL_BARS && a.from > firstBar + 1 && !reached;
    const next = kept[i + 1];
    const wentBack = !!next && next.from <= a.to && a.gapAfter >= STOP_GAP;
    // Stopping at a phrase end (bar 4, 8, 12...) that nobody got past may be
    // the end of the section being practised, not a stall.
    const sectionEnd = a.to >= furthest - 1 && a.to % 4 === 0;
    const stalled = !reached && !drill && wentBack && !sectionEnd;
    return {
      start: Math.round(a.start),
      end: Math.round(a.end),
      from_bar: a.from,
      to_bar: a.to,
      ...(secPerBar ? { sec_per_bar: secPerBar } : {}),
      ...(secPerBar && beats ? { bpm: Math.round((beats * 60) / secPerBar) } : {}),
      reached_end: reached,
      drill,
      stalled,
    };
  });

  // Stops within a bar of each other count as the same spot.
  const stallCounts = new Map<number, number>();
  for (const a of attempts) if (a.stalled) stallCounts.set(a.to_bar, (stallCounts.get(a.to_bar) ?? 0) + 1);
  const stallBars: { bar: number; times: number }[] = [];
  for (const [bar, times] of [...stallCounts].sort((x, y) => y[1] - x[1] || x[0] - y[0])) {
    const near = stallBars.find((s) => Math.abs(s.bar - bar) <= 1);
    if (near) near.times += times;
    else stallBars.push({ bar, times });
  }
  stallBars.sort((x, y) => y.times - x.times || x.bar - y.bar);

  const full = attempts.filter((a) => !a.drill && a.sec_per_bar && a.to_bar - a.from_bar >= 2);
  const reference = full[0]?.sec_per_bar;

  const drills: DrillSpot[] = [];
  for (const a of attempts.filter((x) => x.drill)) {
    const spot = drills.find((d) => a.from_bar <= d.to_bar && d.from_bar <= a.to_bar);
    if (spot) {
      spot.from_bar = Math.min(spot.from_bar, a.from_bar);
      spot.to_bar = Math.max(spot.to_bar, a.to_bar);
      spot.times++;
    } else drills.push({ from_bar: a.from_bar, to_bar: a.to_bar, times: 1, slower: false });
  }
  for (const d of drills) {
    const speeds = attempts
      .filter((a) => a.drill && a.from_bar <= d.to_bar && d.from_bar <= a.to_bar && a.sec_per_bar)
      .map((a) => a.sec_per_bar!);
    d.slower = !!reference && speeds.length > 0 && median(speeds) >= reference * SLOWER;
  }
  // One pass over a short stretch is not working a spot.
  const worked = drills.filter((d) => d.times >= 2);

  const firstFull = full[0];
  const slowedAt = reference
    ? attempts.find((a) => a !== firstFull && a.start > (firstFull?.start ?? 0) && (a.sec_per_bar ?? 0) >= reference * SLOWER)
    : undefined;
  const slowed = !!slowedAt;

  const workStart = Math.min(
    ...worked.map((d) => attempts.find((a) => a.drill && a.from_bar <= d.to_bar && d.from_bar <= a.to_bar)!.start),
    slowedAt?.start ?? Infinity,
  );
  const hardest = stallBars[0]?.bar ?? worked[0]?.to_bar;
  const throughAfterWork =
    Number.isFinite(workStart) &&
    attempts.some(
      (a) =>
        a.start >= workStart &&
        !a.drill &&
        (hardest === undefined ? a.reached_end : a.from_bar < hardest && a.to_bar > hardest + 1),
    );

  const completed = attempts.filter((a) => a.reached_end && a.from_bar <= firstBar + 1).length;
  const startsFromTop = attempts.filter((a) => a.from_bar <= firstBar + 1).length;
  const stalls = attempts.filter((a) => a.stalled).length;
  const runs = attempts.filter((a) => !a.drill);

  let verdict: MethodVerdict;
  if (attempts.length === 1) verdict = "single";
  else if ((worked.length || slowed) && throughAfterWork) verdict = "good_method";
  else if (stalls >= 2 && !worked.length && !slowed) verdict = "stuck_restarting";
  else if (worked.length && !throughAfterWork) verdict = "drilled_not_through";
  else if (runs.length >= 2 && !worked.length && !slowed && stalls < 2) verdict = "run_throughs";
  else verdict = "mixed";

  return {
    title: src.section.display,
    first_bar: firstBar,
    last_bar: lastBar,
    attempts,
    completed,
    starts_from_top: startsFromTop,
    furthest_bar: furthest,
    stall_bars: stallBars,
    drills: worked,
    slowed,
    through_after_work: throughAfterWork,
    verdict,
  };
}

export const VERDICT_WORDS: Record<MethodVerdict, string> = {
  good_method: "Good method: slowed down or worked the spot, then got through",
  stuck_restarting: "Kept restarting and stopping, without slowing down or working the spot",
  drilled_not_through: "Worked a spot but didn't get through the passage afterwards",
  run_throughs: "Played the same stretch through again and again, no spot work",
  mixed: "Mixed",
  single: "One attempt",
};

function clock(s: number): string {
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.round(s % 60)).padStart(2, "0")}`;
}

export function barsLabel(a: { from_bar: number; to_bar: number }): string {
  return a.from_bar === a.to_bar ? `bar ${a.from_bar}` : `bars ${a.from_bar}-${a.to_bar}`;
}

/** Plain counts per piece, for Claude and the teacher. */
export function methodText(methods: PieceMethod[]): string {
  return methods
    .map((m) => {
      const lines = [
        `${m.title} (bars ${m.first_bar}-${m.last_bar}): ${m.attempts.length} attempt${m.attempts.length === 1 ? "" : "s"}, ${m.starts_from_top} from the top, ${m.completed} played start to end. Furthest bar reached: ${m.furthest_bar}.`,
      ];
      if (m.stall_bars.length)
        lines.push(`Stopped and went back at: ${m.stall_bars.map((s) => `bar ${s.bar} (${s.times}x)`).join(", ")}.`);
      if (m.drills.length)
        lines.push(
          `Spot work (short loops not from the top): ${m.drills.map((d) => `${barsLabel(d)} ${d.times}x${d.slower ? ", slower" : ""}`).join("; ")}.`,
        );
      else lines.push("No spot work: no short loops on a passage.");
      lines.push(m.slowed ? "Tempo came down on a later attempt." : "Tempo never came down noticeably on later attempts.");
      if (m.drills.length || m.slowed)
        lines.push(m.through_after_work ? "Got through the hard spot after the work." : "Did not get through the hard spot after the work.");
      lines.push(`Verdict by code: ${VERDICT_WORDS[m.verdict]}.`);
      lines.push(
        "Attempts:\n" +
          m.attempts
            .map(
              (a) =>
                `  ${clock(a.start)}-${clock(a.end)} ${barsLabel(a)}${a.sec_per_bar ? `, ${a.sec_per_bar} s/bar` : ""}${a.bpm ? ` (~${a.bpm} bpm)` : ""}${a.reached_end ? ", reached the end" : ""}${a.drill ? ", spot loop" : ""}${a.stalled ? ", stopped and went back" : ""}`,
            )
            .join("\n"),
      );
      return lines.join("\n");
    })
    .join("\n\n");
}
