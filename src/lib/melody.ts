// The melody of uploaded sheet music, written out once by Claude as note
// names bar by bar (stored in scores.melody), and the code that matches a
// practice session's notes against it: which piece was played, which bars,
// and when. Matching is plain code, free and instant.

import type { Json } from "@/lib/supabase/types";
import { midiOf, type Note } from "@/lib/practice/notes";

export type MelodyBar = { bar: number; page: number; notes: string };

export type MelodySection = {
  /** The section's title as Claude found it, and the title to show (student's repertoire name first). */
  title: string;
  display: string;
  start_page: number;
  end_page: number;
  status: "done" | "error";
  error?: string;
  key_signature?: string;
  time_signature?: string;
  bars: MelodyBar[];
};

export type ScoreMelody = { v: 1; sections: Record<string, MelodySection> };

export function sectionKey(s: { start_page: number; title: string }): string {
  return `${s.start_page}:${s.title}`;
}

export function parseMelody(json: Json | null | undefined): ScoreMelody {
  if (!json || typeof json !== "object" || Array.isArray(json)) return { v: 1, sections: {} };
  const o = json as { sections?: unknown };
  const sections: Record<string, MelodySection> = {};
  if (o.sections && typeof o.sections === "object" && !Array.isArray(o.sections)) {
    for (const [k, v] of Object.entries(o.sections as Record<string, unknown>)) {
      if (!v || typeof v !== "object") continue;
      const s = v as Partial<MelodySection>;
      sections[k] = {
        title: String(s.title ?? ""),
        display: String(s.display ?? s.title ?? ""),
        start_page: Number(s.start_page) || 1,
        end_page: Number(s.end_page) || Number(s.start_page) || 1,
        status: s.status === "error" ? "error" : "done",
        ...(s.error ? { error: String(s.error) } : {}),
        ...(s.key_signature ? { key_signature: String(s.key_signature) } : {}),
        ...(s.time_signature ? { time_signature: String(s.time_signature) } : {}),
        bars: Array.isArray(s.bars)
          ? s.bars
              .filter((b): b is MelodyBar => !!b && typeof b === "object" && typeof (b as MelodyBar).notes === "string")
              .map((b) => ({ bar: Number(b.bar) || 0, page: Number(b.page) || 0, notes: b.notes }))
          : [],
      };
    }
  }
  return { v: 1, sections };
}

export type MusicMatch = {
  /** Piece as the student's repertoire names it, when it matched one. */
  title: string;
  /** The uploaded music it came from. */
  score_title: string;
  /** Seconds from the start of the session. */
  start: number;
  end: number;
  /** Bars heard, e.g. "1-8, 13-24". */
  bars: string;
  bars_heard: number;
  bars_total: number;
  /** Matching note patterns; more is a surer match. */
  hits: number;
};

const GRAM = 5;
/** Matches of one piece further apart than this are separate stretches. */
const CLUSTER_GAP = 20;
const MIN_HITS = 4;

type Seq = { pc: number; bar: number }[];

function melodySeq(s: MelodySection): Seq {
  const out: Seq = [];
  for (const b of s.bars) {
    for (const name of b.notes.split(/\s+/)) {
      const m = midiOf(name.replace("♯", "#").replace("♭", "b"));
      if (m === null) continue;
      const pc = ((m % 12) + 12) % 12;
      // Repeated notes are one (the recording can't tell re-bows apart).
      if (out.length && out[out.length - 1].pc === pc) continue;
      out.push({ pc, bar: b.bar });
    }
  }
  return out;
}

/** "1-8, 13-24", joining across a single missing bar. */
export function barRanges(bars: number[]): string {
  const s = [...new Set(bars)].sort((a, b) => a - b);
  const parts: string[] = [];
  let from = s[0];
  let to = s[0];
  for (const b of s.slice(1)) {
    if (b - to <= 2) to = b;
    else {
      parts.push(from === to ? `${from}` : `${from}-${to}`);
      from = to = b;
    }
  }
  if (s.length) parts.push(from === to ? `${from}` : `${from}-${to}`);
  return parts.join(", ");
}

export type MelodySource = { scoreTitle: string; section: MelodySection };

/**
 * Finds the stretches of a session that follow a piece in the uploaded
 * music. Pitch classes are compared (so an octave slip doesn't matter) five
 * notes at a time; a stretch needs several matching patterns. `skip` drops
 * time ranges already explained (scales), whose runs would otherwise match
 * every piece that has a scale run in it.
 */
export function matchMusic(notes: Note[], sources: MelodySource[], skip: { start: number; end: number }[] = []): MusicMatch[] {
  // Each five-note pattern points at the bars its notes are in.
  const index = new Map<string, { src: number; bars: number[] }[]>();
  const seqs = sources.map((s) => melodySeq(s.section));
  seqs.forEach((seq, src) => {
    for (let i = 0; i + GRAM <= seq.length; i++) {
      const part = seq.slice(i, i + GRAM);
      const g = part.map((x) => x.pc).join(",");
      const list = index.get(g) ?? [];
      list.push({ src, bars: [...new Set(part.map((x) => x.bar))] });
      index.set(g, list);
    }
  });
  if (!index.size) return [];

  const played: { pc: number; t: number }[] = [];
  for (const n of notes) {
    if (skip.some((r) => n.start >= r.start - 0.5 && n.end <= r.end + 0.5)) continue;
    const pc = ((n.midi % 12) + 12) % 12;
    if (played.length && played[played.length - 1].pc === pc) continue;
    played.push({ pc, t: n.start });
  }

  const hits: { src: number; bars: number[]; t: number }[] = [];
  for (let i = 0; i + GRAM <= played.length; i++) {
    const g = played
      .slice(i, i + GRAM)
      .map((x) => x.pc)
      .join(",");
    const found = index.get(g);
    if (!found) continue;
    // A pattern that appears in many pieces says little.
    const srcs = new Set(found.map((f) => f.src));
    if (srcs.size > 3) continue;
    for (const src of srcs)
      hits.push({ src, bars: [...new Set(found.filter((f) => f.src === src).flatMap((f) => f.bars))], t: played[i].t });
  }

  const out: MusicMatch[] = [];
  const bySrc = new Map<number, typeof hits>();
  for (const h of hits) bySrc.set(h.src, [...(bySrc.get(h.src) ?? []), h]);
  for (const [src, hs] of bySrc) {
    hs.sort((a, b) => a.t - b.t);
    let cluster: typeof hs = [];
    const flush = () => {
      const bars = [...new Set(cluster.flatMap((c) => c.bars))];
      if (cluster.length >= MIN_HITS && bars.length >= 2) {
        const total = new Set(sources[src].section.bars.map((b) => b.bar)).size;
        out.push({
          title: sources[src].section.display,
          score_title: sources[src].scoreTitle,
          start: Math.round(cluster[0].t),
          end: Math.round(cluster[cluster.length - 1].t + 2),
          bars: barRanges(bars),
          bars_heard: bars.length,
          bars_total: total,
          hits: cluster.length,
        });
      }
      cluster = [];
    };
    for (const h of hs) {
      if (cluster.length && h.t - cluster[cluster.length - 1].t > CLUSTER_GAP) flush();
      cluster.push(h);
    }
    flush();
  }

  // Where two pieces claim the same stretch, keep the surer one.
  out.sort((a, b) => b.hits - a.hits);
  const kept: MusicMatch[] = [];
  for (const m of out) {
    const clash = kept.find((k) => m.start < k.end && k.start < m.end && k.title !== m.title);
    if (clash && clash.hits >= m.hits * 2) continue;
    kept.push(m);
  }
  return kept.sort((a, b) => a.start - b.start);
}

/** One entry per piece for display: "Gavotte · bars 1-24". */
export function musicByPiece(matches: MusicMatch[]): { title: string; bars: string; seconds: number }[] {
  const by = new Map<string, { title: string; bars: number[]; seconds: number; barsText: string[] }>();
  for (const m of matches) {
    const e = by.get(m.title) ?? { title: m.title, bars: [], seconds: 0, barsText: [] };
    e.seconds += m.end - m.start;
    e.barsText.push(m.bars);
    by.set(m.title, e);
  }
  return [...by.values()].map((e) => ({
    title: e.title,
    bars: barRanges(e.barsText.flatMap(expandRanges)),
    seconds: Math.round(e.seconds),
  }));
}

function expandRanges(s: string): number[] {
  return s.split(",").flatMap((part) => {
    const [a, b] = part.trim().split("-").map(Number);
    if (!Number.isFinite(a)) return [];
    const end = Number.isFinite(b) ? b : a;
    const out: number[] = [];
    for (let i = a; i <= end && out.length < 500; i++) out.push(i);
    return out;
  });
}
