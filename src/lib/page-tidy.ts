// Shared tidy-up steps for a digitized page of music, run after the page has
// been cleaned to black ink on white (digitize-page.ts). Pure array work, so
// it runs in the browser and in tests.
//
// 1. Flatten: finds every staff line, follows it across the page, and pulls
//    each column up or down so curved staves (a book that won't lie flat, a
//    bent sheet) come out straight and level.
// 2. Smart crop: removes what isn't this page (black edges, shadows, bits of
//    another sheet under it), crops to the music and puts it on a clean
//    letter-shaped page with even margins.

export type Ink = { data: Uint8ClampedArray; w: number; h: number };

const DARK = 140;

/** Staff lines found on the page: where each sits once straightened, and the staff spacing. */
export type Staves = { lines: number[]; spacing: number };

type Track = { xs: number[]; ys: number[] };

/** Rows of one vertical strip that are mostly ink (staff lines run right across a strip; notes don't). */
function stripPeaks(ink: Ink, x0: number, x1: number): number[] {
  const { data, w, h } = ink;
  const width = x1 - x0;
  const frac = new Float32Array(h);
  for (let y = 0; y < h; y++) {
    let n = 0;
    const row = y * w;
    for (let x = x0; x < x1; x++) if (data[row + x] < DARK) n++;
    frac[y] = n / width;
  }
  const peaks: number[] = [];
  let y = 0;
  while (y < h) {
    if (frac[y] < 0.5) {
      y++;
      continue;
    }
    // A thick line covers a few rows: take its middle.
    let end = y;
    while (end + 1 < h && frac[end + 1] >= 0.5) end++;
    if (end - y < 8) peaks.push((y + end) / 2);
    y = end + 1;
  }
  return peaks;
}

function median(v: number[]): number {
  if (!v.length) return 0;
  const s = [...v].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

/** Least-squares polynomial (degree ≤ 3) through the points; coefficients low → high. */
function polyfit(xs: number[], ys: number[], degree: number): number[] | null {
  const n = degree + 1;
  const A = Array.from({ length: n }, () => new Array(n + 1).fill(0));
  for (let k = 0; k < xs.length; k++) {
    const p: number[] = [1];
    for (let i = 1; i < n; i++) p.push(p[i - 1] * xs[k]);
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) A[r][c] += p[r] * p[c];
      A[r][n] += p[r] * ys[k];
    }
  }
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
    if (Math.abs(A[piv][col]) < 1e-9) return null;
    [A[col], A[piv]] = [A[piv], A[col]];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = A[r][col] / A[col][col];
      for (let c = col; c <= n; c++) A[r][c] -= f * A[col][c];
    }
  }
  return A.map((row, i) => row[n] / row[i]);
}

const evalPoly = (c: number[], x: number) => c.reduceRight((s, k) => s * x + k, 0);

/**
 * Straightens curved staves by moving each column up or down. Returns the
 * flattened page and the staff lines found (as they sit after flattening),
 * or the page unchanged when too few staff lines could be followed.
 */
export function flattenStaves(ink: Ink): { ink: Ink; staves: Staves | null } {
  const { w, h } = ink;
  const strips = Math.max(12, Math.min(48, Math.round(w / 40)));
  const sw = w / strips;
  const peaks: number[][] = [];
  for (let s = 0; s < strips; s++) peaks.push(stripPeaks(ink, Math.round(s * sw), Math.round((s + 1) * sw)));

  // Staff spacing from the middle of the page.
  const gaps: number[] = [];
  for (let s = Math.floor(strips / 3); s < Math.ceil((2 * strips) / 3); s++) {
    const p = peaks[s];
    for (let i = 1; i < p.length; i++) if (p[i] - p[i - 1] < h / 20) gaps.push(p[i] - p[i - 1]);
  }
  const spacing = median(gaps);
  if (!spacing || spacing < 4) return { ink, staves: null };

  // Seed from the middle strip with the most lines, then follow each line out both ways.
  let seed = Math.floor(strips / 2);
  for (let s = Math.floor(strips / 3); s < Math.ceil((2 * strips) / 3); s++) if (peaks[s].length > peaks[seed].length) seed = s;
  if (peaks[seed].length < 5) return { ink, staves: null };
  const window = Math.max(2, spacing * 0.35);
  const tracks: Track[] = peaks[seed].map((y) => ({ xs: [(seed + 0.5) * sw], ys: [y] }));
  for (const t of tracks) {
    for (const dir of [-1, 1]) {
      let y = t.ys[0];
      let slope = 0;
      let lastX = (seed + 0.5) * sw;
      let misses = 0;
      for (let s = seed + dir; s >= 0 && s < strips && misses < 3; s += dir) {
        const x = (s + 0.5) * sw;
        const want = y + slope * (x - lastX);
        let best: number | null = null;
        for (const p of peaks[s]) if (Math.abs(p - want) <= window && (best === null || Math.abs(p - want) < Math.abs(best - want))) best = p;
        if (best === null) {
          misses++;
          continue;
        }
        misses = 0;
        slope = 0.5 * slope + 0.5 * ((best - y) / (x - lastX));
        y = best;
        lastX = x;
        t.xs.push(x);
        t.ys.push(best);
      }
    }
  }

  // Fit each line and keep the believable ones.
  type Line = { coef: number[]; target: number; xmin: number; xmax: number; t: Track };
  const lines: Line[] = [];
  const cx = w / 2;
  for (const t of tracks) {
    if (t.xs.length < Math.max(5, strips * 0.3)) continue;
    const xs = t.xs.map((x) => x / w);
    const coef = polyfit(xs, t.ys, t.xs.length >= 10 ? 3 : 2);
    if (!coef) continue;
    const xmin = Math.min(...t.xs);
    const xmax = Math.max(...t.xs);
    const target = evalPoly(coef, Math.min(Math.max(cx, xmin), xmax) / w);
    const bad = t.xs.some((x, i) => Math.abs(evalPoly(coef, x / w) - t.ys[i]) > spacing * 0.6);
    const far = t.xs.some((x) => Math.abs(evalPoly(coef, x / w) - target) > h * 0.06);
    if (!bad && !far) lines.push({ coef, target, xmin, xmax, t });
  }
  if (lines.length < 5) return { ink, staves: null };
  lines.sort((a, b) => a.target - b.target);
  // Two lines can't sit on top of each other.
  const kept = lines.filter((l, i) => i === 0 || l.target - lines[i - 1].target > spacing * 0.5);
  // The lines of one staff bend together: fit one curve per staff from all
  // its lines, so a line that was followed less far doesn't tear the staff.
  const uniq: Line[] = [];
  let group: Line[] = [];
  const flush = () => {
    if (!group.length) return;
    const xs: number[] = [];
    const ys: number[] = [];
    for (const l of group)
      l.t.xs.forEach((x, i) => {
        xs.push(x / w);
        ys.push(l.t.ys[i] - l.target);
      });
    const coef = polyfit(xs, ys, xs.length >= 10 ? 3 : 2);
    const xmin = Math.min(...group.map((l) => l.xmin));
    const xmax = Math.max(...group.map((l) => l.xmax));
    for (const l of group) uniq.push(coef ? { ...l, coef: coef.map((c, i) => (i === 0 ? c + l.target : c)), xmin, xmax } : l);
    group = [];
  };
  for (const l of kept) {
    if (group.length && l.target - group[group.length - 1].target > spacing * 1.6) flush();
    group.push(l);
  }
  flush();

  // Each column: how far each line has to move, filled in between lines.
  const out = new Uint8ClampedArray(w * h);
  const src = ink.data;
  const shifts = new Float32Array(uniq.length);
  for (let x = 0; x < w; x++) {
    for (let i = 0; i < uniq.length; i++) {
      const l = uniq[i];
      const xx = Math.min(Math.max(x, l.xmin), l.xmax) / w;
      shifts[i] = evalPoly(l.coef, xx) - l.target;
    }
    let j = 0;
    for (let y = 0; y < h; y++) {
      while (j < uniq.length && uniq[j].target < y) j++;
      let d: number;
      if (j === 0) d = shifts[0];
      else if (j === uniq.length) d = shifts[uniq.length - 1];
      else {
        const a = uniq[j - 1].target;
        const b = uniq[j].target;
        const t = (y - a) / (b - a);
        d = shifts[j - 1] * (1 - t) + shifts[j] * t;
      }
      const sy = y + d;
      const y0 = Math.floor(sy);
      const f = sy - y0;
      const v0 = y0 >= 0 && y0 < h ? src[y0 * w + x] : 255;
      const v1 = y0 + 1 >= 0 && y0 + 1 < h ? src[(y0 + 1) * w + x] : 255;
      out[y * w + x] = v0 * (1 - f) + v1 * f;
    }
  }
  return { ink: { data: out, w, h }, staves: { lines: uniq.map((l) => l.target), spacing } };
}

/** Where the music is on the page, and what was wiped as not part of it. */
export type CropBox = { x: number; y: number; w: number; h: number };

/**
 * Wipes what isn't this page's music and finds the box around what is.
 * Returns null when nothing sensible is left (then the page is kept whole).
 */
export function findMusicBox(ink: Ink, staves: Staves | null): { ink: Ink; box: CropBox } | null {
  const { w, h } = ink;
  const data = new Uint8ClampedArray(ink.data);
  const labels = new Int32Array(w * h).fill(-1);
  const stack = new Int32Array(w * h);
  const spacing = staves?.spacing || Math.max(6, Math.round(h / 180));
  const dust = Math.max(4, Math.round((spacing * spacing) / 12));
  let label = 0;
  for (let start = 0; start < w * h; start++) {
    if (labels[start] !== -1 || data[start] >= DARK) continue;
    let top = 0;
    stack[top++] = start;
    labels[start] = label;
    const members: number[] = [];
    let minX = w, maxX = 0, minY = h, maxY = 0;
    while (top) {
      const i = stack[--top];
      members.push(i);
      const x = i % w;
      const y = (i - x) / w;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (x > 0 && labels[i - 1] === -1 && data[i - 1] < DARK) {
        labels[i - 1] = label;
        stack[top++] = i - 1;
      }
      if (x < w - 1 && labels[i + 1] === -1 && data[i + 1] < DARK) {
        labels[i + 1] = label;
        stack[top++] = i + 1;
      }
      if (y > 0 && labels[i - w] === -1 && data[i - w] < DARK) {
        labels[i - w] = label;
        stack[top++] = i - w;
      }
      if (y < h - 1 && labels[i + w] === -1 && data[i + w] < DARK) {
        labels[i + w] = label;
        stack[top++] = i + w;
      }
    }
    label++;
    const bw = maxX - minX + 1;
    const bh = maxY - minY + 1;
    const density = members.length / (bw * bh);
    const edge = minX <= 1 || minY <= 1 || maxX >= w - 2 || maxY >= h - 2;
    // A solid black patch (the table, a shadow, the edge of the paper), a
    // speck of dust, or something cut off by the edge of the photo that isn't
    // a whole line of music.
    const blob = density > 0.5 && bw * bh > w * h * 0.02;
    const wipe = members.length < dust || blob || (edge && (density > 0.3 || bw < w * 0.5));
    if (wipe) for (const i of members) data[i] = 255;
  }

  // Rows with ink, grouped into bands.
  const rowInk = new Int32Array(h);
  for (let y = 0; y < h; y++) {
    let n = 0;
    for (let x = 0; x < w; x++) if (data[y * w + x] < DARK) n++;
    rowInk[y] = n;
  }
  type Band = { top: number; bottom: number; music: boolean };
  const bands: Band[] = [];
  const join = Math.max(3, Math.round(spacing * 1.2));
  for (let y = 0; y < h; y++) {
    if (rowInk[y] < 2) continue;
    const last = bands[bands.length - 1];
    if (last && y - last.bottom <= join) last.bottom = y;
    else bands.push({ top: y, bottom: y, music: false });
  }
  if (!bands.length) return null;
  // A band is music when a staff (at least three of its lines) runs through it.
  for (const b of bands) b.music = !staves || staves.lines.filter((l) => l >= b.top - 2 && l <= b.bottom + 2).length >= 3;
  const first = bands.findIndex((b) => b.music);
  let last = -1;
  bands.forEach((b, i) => b.music && (last = i));
  if (first < 0) return null;
  // Titles and footers belong when they sit close to the music; a stray
  // line of another sheet sits apart from it.
  const reach = spacing * 4 * 3;
  let from = first;
  while (from > 0 && bands[from].top - bands[from - 1].bottom <= reach) from--;
  // Below the music: a footer (copyright) close by, then only lines tight under it.
  let to = last;
  while (to < bands.length - 1) {
    const gap = bands[to + 1].top - bands[to].bottom;
    if (gap > (bands[to].music ? reach : spacing * 3)) break;
    to++;
  }
  const y0 = bands[from].top;
  const y1 = bands[to].bottom;
  // Everything outside the kept bands goes.
  for (let y = 0; y < h; y++) if (y < y0 || y > y1) data.fill(255, y * w, (y + 1) * w);
  // Left and right: where the ink really starts and ends, so a pencil tick
  // in the margin doesn't widen the page.
  const colInk = new Int32Array(w);
  let total = 0;
  for (let y = y0; y <= y1; y++)
    for (let x = 0; x < w; x++)
      if (data[y * w + x] < DARK) {
        colInk[x]++;
        total++;
      }
  if (!total) return null;
  const trim = total * 0.0003;
  let x0 = 0;
  for (let acc = 0; x0 < w && acc + colInk[x0] <= trim; x0++) acc += colInk[x0];
  let x1 = w - 1;
  for (let acc = 0; x1 > 0 && acc + colInk[x1] <= trim; x1--) acc += colInk[x1];
  if (x1 <= x0) return null;
  for (let y = y0; y <= y1; y++) {
    data.fill(255, y * w, y * w + x0);
    data.fill(255, y * w + x1 + 1, (y + 1) * w);
  }
  const box = { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  if (box.w * box.h < w * h * 0.08) return null;
  return { ink: { data, w, h }, box };
}

/** The clean page the music is placed on: letter shaped, even margins. */
export function letterPage(box: CropBox, maxEdge: number): { pw: number; ph: number; k: number; ox: number; oy: number } {
  const RATIO = 11 / 8.5;
  let pw = box.w / 0.88;
  let ph = pw * RATIO;
  if (box.h > ph * 0.94) {
    ph = box.h / 0.94;
    pw = ph / RATIO;
  }
  const k = Math.min(1, maxEdge / ph);
  const side = (pw - box.w) / 2;
  const topGap = Math.min(side, (ph - box.h) / 2);
  return { pw: Math.round(pw * k), ph: Math.round(ph * k), k, ox: side * k, oy: topGap * k };
}
