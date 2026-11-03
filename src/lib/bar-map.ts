// The bar map of a piece of uploaded sheet music (shared by server and
// client): for each page, every line of music (staff system) with its bar
// lines and the number of its first bar. It is made once per upload (the bar
// lines are found in the page image, Claude numbers them) and checked by the
// teacher, so highlighting "bars 13–15" is a lookup that lands in the same
// place every time instead of Claude counting bars on a photo again.
//
// Kept on each page entry of scores.pages (pages[i].bars), so it goes away by
// itself when the file is replaced.

import { sectionLabel, type ScoreSection } from "@/lib/score-analysis";
import type { MusicRef, PageBox } from "@/lib/music-links";

export type BarLine = {
  /** Top and bottom staff line of the system, as fractions of page height. */
  top: number;
  bottom: number;
  /** Where the line's staff starts and ends, as fractions of page width. */
  left: number;
  right: number;
  /** Bar lines inside the line, left to right, as fractions of page width. */
  dividers: number[];
  /** Staves in the system (2 for piano). */
  staves: number;
  /** Number of the first bar on the line, counted from the start of its piece (0 = pickup). */
  first: number;
  /** The piece the line belongs to (its section label), "" if none. */
  piece: string;
  /** Claude's count or numbering didn't agree with what was found: worth a look. */
  check: boolean;
};

export type PageBars = {
  lines: BarLine[];
  /** The teacher looked at this page and it's right. */
  checked: boolean;
  made_at: string;
};

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
const frac = (v: unknown) => Math.min(Math.max(num(v), 0), 1);

export function parseBarLine(v: unknown): BarLine | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const top = frac(o.top);
  const bottom = frac(o.bottom);
  const left = frac(o.left);
  const right = frac(o.right);
  if (!(bottom > top) || !(right > left)) return null;
  const dividers = (Array.isArray(o.dividers) ? o.dividers : [])
    .map(frac)
    .filter((x) => x > left && x < right)
    .sort((a, b) => a - b);
  return {
    top,
    bottom,
    left,
    right,
    dividers,
    staves: Math.max(1, Math.round(num(o.staves, 1))),
    first: Math.max(0, Math.round(num(o.first, 1))),
    piece: typeof o.piece === "string" ? o.piece : "",
    check: o.check === true,
  };
}

export function parsePageBars(v: unknown): PageBars | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  if (!Array.isArray(o.lines)) return null;
  return {
    lines: o.lines.flatMap((l) => parseBarLine(l) ?? []).sort((a, b) => a.top - b.top),
    checked: o.checked === true,
    made_at: typeof o.made_at === "string" ? o.made_at : "",
  };
}

/** The bar map of every page of a raw scores.pages value (null where a page has none). */
export function parseBarMap(pages: unknown): (PageBars | null)[] {
  if (!Array.isArray(pages)) return [];
  // Same pages as parsePages keeps (entries with a path), in the same order.
  return pages
    .filter((p) => p && typeof p === "object" && typeof (p as { path?: unknown }).path === "string")
    .map((p) => parsePageBars((p as { bars?: unknown }).bars));
}

/** Bars on a line, each with its number and left/right edge (fractions of page width). */
export function lineBars(line: BarLine): { n: number; x0: number; x1: number }[] {
  const edges = [line.left, ...line.dividers, line.right];
  return edges.slice(1).map((x1, i) => ({ n: line.first + i, x0: edges[i], x1 }));
}

/** "13-15", "13–15", "9", "bars 1 to 8", "13, 14" → [from, to]; null if no number. */
export function parseBarRange(bars: string): [number, number] | null {
  const ns = (bars.match(/\d+/g) ?? []).map(Number).filter((n) => n < 2000);
  if (!ns.length) return null;
  const a = Math.min(...ns);
  const b = Math.max(...ns);
  // "9 and 30" is two places, not bars 9 to 30: keep to the first one then.
  return b - a > 24 ? [ns[0], ns[0]] : [a, b];
}

type MapScore = { pages: { bars?: PageBars | null }[]; sections: ScoreSection[] };

/** The lines of one piece, in order, with their page numbers. */
export function pieceLines(score: MapScore, section: ScoreSection): { page: number; line: BarLine }[] {
  const label = sectionLabel(section);
  const all: { page: number; line: BarLine }[] = [];
  for (let p = section.start_page; p <= section.end_page; p++) {
    const bars = score.pages[p - 1]?.bars;
    for (const line of bars?.lines ?? []) all.push({ page: p, line });
  }
  const own = all.filter((l) => l.line.piece === label);
  // Piece names in the map can go stale when the music is read again: then
  // every line on the piece's pages that isn't marked as another piece.
  if (own.length) return own;
  const labels = new Set(score.sections.map((s) => sectionLabel(s)));
  return all.filter((l) => !l.line.piece || !labels.has(l.line.piece));
}

/** True when every page of the piece has a bar map. */
export function pieceMapped(score: MapScore, section: ScoreSection): boolean {
  for (let p = section.start_page; p <= section.end_page; p++) if (!score.pages[p - 1]?.bars) return false;
  return section.end_page >= section.start_page;
}

/**
 * Where bars `from`–`to` of a piece are, from the bar map: the page they start
 * on and a box around them (and the lines they run onto on that page).
 */
export function boxForBars(
  score: MapScore,
  section: ScoreSection,
  from: number,
  to: number,
): { page: number; box: PageBox } | null {
  if (!pieceMapped(score, section)) return null;
  const hits: { page: number; line: BarLine; x0: number; x1: number }[] = [];
  for (const { page, line } of pieceLines(score, section))
    for (const bar of lineBars(line)) if (bar.n >= from && bar.n <= to) hits.push({ page, line, ...bar });
  if (!hits.length) return null;
  const page = hits[0].page;
  const on = hits.filter((h) => h.page === page);
  // Some room above and below the staff for notes on ledger lines.
  const pad = Math.max(...on.map((h) => (h.line.bottom - h.line.top) / (h.line.staves * 4))) * 3;
  const x0 = Math.max(0, Math.min(...on.map((h) => h.x0)) - 0.006);
  const x1 = Math.min(1, Math.max(...on.map((h) => h.x1)) + 0.006);
  const y0 = Math.max(0, Math.min(...on.map((h) => h.line.top)) - pad);
  const y1 = Math.min(1, Math.max(...on.map((h) => h.line.bottom)) + pad);
  return { page, box: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } };
}

/**
 * After the first bar number of one line changes by `delta` (a corrected
 * number, a bar line added or taken away), the lines after it in the same
 * piece move by the same amount, on this page and the pages after it.
 */
export function shiftFollowing(
  map: (PageBars | null)[],
  page: number,
  lineIndex: number,
  delta: number,
): (PageBars | null)[] {
  if (!delta) return map;
  const piece = map[page - 1]?.lines[lineIndex]?.piece ?? "";
  // Pages are copied only when a line on them moves.
  const out = [...map];
  for (let p = page; p <= out.length; p++) {
    const bars = out[p - 1];
    if (!bars) break;
    let lines: BarLine[] | null = null;
    for (let i = p === page ? lineIndex + 1 : 0; i < bars.lines.length; i++) {
      const l = bars.lines[i];
      // Another piece, or a line numbered from 0 or 1 again (a new part), ends it.
      const stop = l.piece !== piece || l.first <= 1;
      if (!stop) {
        lines ??= [...bars.lines];
        lines[i] = { ...l, first: Math.max(0, l.first + delta) };
      }
      if (stop) {
        if (lines) out[p - 1] = { ...bars, lines };
        return out;
      }
    }
    if (lines) out[p - 1] = { ...bars, lines };
  }
  return out;
}

/**
 * Lesson-review links with their boxes taken from the bar map wherever the
 * piece is mapped, so a corrected map shows on every lesson straight away
 * (without matching the clips again). Links whose bars aren't in the map keep
 * the box Claude drew.
 */
export function applyBarMap<L extends { music: MusicRef | null }>(
  links: L[],
  scores: (MapScore & { id: string })[],
): L[] {
  return links.map((l) => {
    const m = l.music;
    const range = m?.bars ? parseBarRange(m.bars) : null;
    if (!m || !range) return l;
    const score = scores.find((s) => s.id === m.scoreId);
    if (!score) return l;
    const candidates = score.sections.filter((s) => s.start_page === m.fromPage && s.end_page === m.toPage);
    const section = candidates.find((s) => sectionLabel(s) === m.piece) ?? candidates[0];
    if (!section) return l;
    const found = boxForBars(score, section, range[0], range[1]);
    return found ? { ...l, music: { ...m, page: found.page, box: found.box } } : l;
  });
}
