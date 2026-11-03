// Finds the staff lines and bar lines on a page of printed sheet music, from
// its pixels. Runs on the server in the bar map job (bar-job.ts decodes each
// page image and passes the pixels here). Pure code with no imports, so it can
// be tested on its own.
//
// How it works:
// 1. Pixels become dark/light with a threshold picked from the page itself.
// 2. A small tilt (a photo or a crooked scan) is found by trying slants and
//    keeping the one where dark pixels line up best in rows.
// 3. Staff lines are rows with a long unbroken dark run; five evenly spaced
//    ones make a staff.
// 4. Staves joined by a line at their left edge (a piano grand staff) make one
//    system. A single-line instrument has one staff per system.
// 5. A bar line is a column that is dark from the top staff line to the bottom
//    one of the system and doesn't carry on above or below it. That rules out
//    note stems, which stick out past the staff or stop inside it.

export type DetectedLine = {
  /** Top and bottom staff line of the system, as fractions of page height. */
  top: number;
  bottom: number;
  /** Where the staff lines start and end, as fractions of page width. */
  left: number;
  right: number;
  /** Bar lines inside the line (not its two ends), left to right, as fractions of page width. */
  dividers: number[];
  /** Staves in the system: 1 for cello or violin, 2 for piano. */
  staves: number;
};

type Bitmap = { w: number; h: number; dark: Uint8Array };

/** Dark/light pixels from RGBA, with Otsu's threshold (clamped to sensible values). */
export function toBitmap(rgba: Uint8ClampedArray | Uint8Array, w: number, h: number): Bitmap {
  const lum = new Uint8Array(w * h);
  const hist = new Array<number>(256).fill(0);
  for (let i = 0, j = 0; j < w * h; i += 4, j++) {
    // Transparent counts as white paper.
    const a = rgba[i + 3] / 255;
    const v = Math.round((0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2]) * a + 255 * (1 - a));
    lum[j] = v;
    hist[v]++;
  }
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * hist[t];
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let threshold = 128;
  const total = w * h;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) {
      best = between;
      threshold = t;
    }
  }
  threshold = Math.min(Math.max(threshold, 90), 200);
  const dark = new Uint8Array(w * h);
  for (let j = 0; j < w * h; j++) dark[j] = lum[j] <= threshold ? 1 : 0;
  return { w, h, dark };
}

/** The slant (rows per column) that makes dark pixels line up best in rows. */
function findTilt(b: Bitmap): number {
  const { w, h, dark } = b;
  let bestT = 0;
  let bestScore = -1;
  for (let deg = -2; deg <= 2.0001; deg += 0.25) {
    const t = Math.tan((deg * Math.PI) / 180);
    const rows = new Float64Array(h + 2 * Math.ceil(Math.abs(t) * w) + 2);
    const off = Math.ceil(Math.abs(t) * w) + 1;
    for (let y = 0; y < h; y += 1)
      for (let x = 0; x < w; x += 2) if (dark[y * w + x]) rows[Math.round(y - x * t) + off]++;
    let score = 0;
    for (const r of rows) score += r * r;
    if (score > bestScore * 1.0001) {
      bestScore = score;
      bestT = t;
    }
  }
  return bestT;
}

/** The page with the tilt taken out: pixel (x, y) here is (x, y + x·t) on the page. */
function unslant(b: Bitmap, t: number): Bitmap {
  if (t === 0) return b;
  const { w, h, dark } = b;
  const out = new Uint8Array(w * h);
  for (let x = 0; x < w; x++) {
    const dy = Math.round(x * t);
    for (let y = 0; y < h; y++) {
      const sy = y + dy;
      if (sy >= 0 && sy < h) out[y * w + x] = dark[sy * w + x];
    }
  }
  return { w, h, dark: out };
}

type RowRun = { y: number; x0: number; x1: number };
type Staff = { lines: number[]; top: number; bottom: number; space: number; left: number; right: number };

/** Rows with a long dark run (allowing tiny gaps), merged into candidate staff lines. */
function staffLineCandidates(b: Bitmap): RowRun[] {
  const { w, h, dark } = b;
  const minRun = Math.max(40, Math.round(w * 0.15));
  const rows: RowRun[] = [];
  for (let y = 0; y < h; y++) {
    let bestLen = 0;
    let bx0 = 0;
    let bx1 = 0;
    let start = -1;
    let gap = 0;
    for (let x = 0; x <= w; x++) {
      // A line that is a pixel off level drifts between rows: look one row up and down too.
      const i = y * w + x;
      const d = x < w && (dark[i] || (y > 0 && dark[i - w]) || (y < h - 1 && dark[i + w]));
      if (d) {
        if (start < 0) start = x;
        gap = 0;
      } else if (start >= 0) {
        gap++;
        if (gap > 2 || x === w) {
          const end = x - gap;
          if (end - start + 1 > bestLen) {
            bestLen = end - start + 1;
            bx0 = start;
            bx1 = end;
          }
          start = -1;
          gap = 0;
        }
      }
    }
    if (bestLen >= minRun) rows.push({ y, x0: bx0, x1: bx1 });
  }
  // Neighbouring rows are one thick line.
  const merged: RowRun[] = [];
  let group: RowRun[] = [];
  const flush = () => {
    if (!group.length) return;
    const y = group.reduce((s, r) => s + r.y, 0) / group.length;
    merged.push({
      y,
      x0: Math.min(...group.map((r) => r.x0)),
      x1: Math.max(...group.map((r) => r.x1)),
    });
    group = [];
  };
  for (const r of rows) {
    if (group.length && r.y - group[group.length - 1].y > 1) flush();
    group.push(r);
  }
  flush();
  // A thick blob (a beam or a title bar) isn't a staff line.
  return merged;
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

/** Five evenly spaced candidate lines make a staff. */
function findStaves(b: Bitmap): Staff[] {
  const c = staffLineCandidates(b);
  const staves: Staff[] = [];
  let i = 0;
  while (i + 4 < c.length) {
    let found: RowRun[] | null = null;
    // The next line may be one of a few candidates (a stray long run in between).
    for (let j = i + 1; j < Math.min(c.length, i + 4) && !found; j++) {
      const g = c[j].y - c[i].y;
      if (g < 4 || g > b.h / 15) continue;
      const lines = [c[i], c[j]];
      let k = j + 1;
      while (lines.length < 5 && k < c.length) {
        const want = lines[lines.length - 1].y + g;
        if (Math.abs(c[k].y - want) <= Math.max(1.5, g * 0.22)) lines.push(c[k]);
        else if (c[k].y > want + g * 0.22) break;
        k++;
      }
      if (lines.length === 5) found = lines;
    }
    if (!found) {
      i++;
      continue;
    }
    const top = found[0].y;
    const bottom = found[4].y;
    staves.push({
      lines: found.map((l) => l.y),
      top,
      bottom,
      space: (bottom - top) / 4,
      left: median(found.map((l) => l.x0)),
      right: median(found.map((l) => l.x1)),
    });
    i = c.indexOf(found[4]) + 1;
  }
  return staves;
}

// After the tilt is taken out, staff lines are level but bar lines still lean
// by the same angle (a rotated page turns both). So a "column" here follows
// that lean: x is where it crosses row `ref` (the middle of the system).
let lean = 0;
let ref = 0;

/** Share of dark pixels along the (leaning) column x, or its two neighbours, between rows y0 and y1. */
function columnDark(b: Bitmap, x: number, y0: number, y1: number): number {
  const { w, h, dark } = b;
  const a = Math.max(0, Math.round(y0));
  const z = Math.min(h - 1, Math.round(y1));
  if (z < a) return 0;
  let n = 0;
  for (let y = a; y <= z; y++) {
    const cx = Math.round(x + (y - ref) * lean);
    if (cx < 0 || cx >= w) continue;
    const i = y * w + cx;
    if (dark[i] || (cx > 0 && dark[i - 1]) || (cx < w - 1 && dark[i + 1])) n++;
  }
  return n / (z - a + 1);
}

/** Share of dark pixels along exactly the (leaning) column x between rows y0 and y1. */
function columnDarkExact(b: Bitmap, x: number, y0: number, y1: number): number {
  const { w, h, dark } = b;
  const a = Math.max(0, Math.round(y0));
  const z = Math.min(h - 1, Math.round(y1));
  if (z < a) return 0;
  let n = 0;
  for (let y = a; y <= z; y++) {
    const cx = Math.round(x + (y - ref) * lean);
    if (cx >= 0 && cx < w && dark[y * w + cx]) n++;
  }
  return n / (z - a + 1);
}

/** Staves joined by a dark line near their left end belong to one system. */
function groupSystems(b: Bitmap, staves: Staff[]): Staff[][] {
  const systems: Staff[][] = [];
  for (const s of staves) {
    const prev = systems[systems.length - 1];
    const last = prev?.[prev.length - 1];
    let joined = false;
    if (last && s.top - last.bottom < last.space * 14) {
      const x0 = Math.max(0, Math.round(Math.min(s.left, last.left) - s.space));
      const x1 = Math.min(b.w - 1, Math.round(Math.max(s.left, last.left) + s.space * 1.5));
      ref = (last.top + s.bottom) / 2;
      for (let x = x0; x <= x1 && !joined; x++)
        if (columnDarkExact(b, x, last.top, s.bottom) >= 0.9) joined = true;
    }
    if (joined) prev.push(s);
    else systems.push([s]);
  }
  return systems;
}

/** Bar line x positions (pixels) inside one system. */
function barLines(b: Bitmap, sys: Staff[]): { left: number; right: number; xs: number[] } {
  const first = sys[0];
  const lastStaff = sys[sys.length - 1];
  const space = median(sys.map((s) => s.space));
  const left = Math.min(...sys.map((s) => s.left));
  const right = Math.max(...sys.map((s) => s.right));
  ref = (first.top + lastStaff.bottom) / 2;
  const hits: number[] = [];
  for (let x = Math.round(left); x <= Math.round(right); x++) {
    let ok = true;
    for (let k = 0; k < sys.length && ok; k++) {
      const s = sys[k];
      // Dark the whole height of the staff…
      if (columnDarkExact(b, x, s.top, s.bottom) < 0.9) ok = false;
    }
    if (!ok) continue;
    // …and not carrying on past the system (that would be a stem).
    if (columnDarkExact(b, x, first.top - space * 0.9, first.top - space * 0.35) > 0.3) continue;
    if (columnDarkExact(b, x, lastStaff.bottom + space * 0.35, lastStaff.bottom + space * 0.9) > 0.3) continue;
    // Between two staves of one system: either joined all the way, or clear near each staff.
    for (let k = 0; k + 1 < sys.length && ok; k++) {
      const a = sys[k];
      const z = sys[k + 1];
      if (columnDark(b, x, a.bottom, z.top) >= 0.9) continue;
      if (columnDarkExact(b, x, a.bottom + space * 0.35, a.bottom + space * 0.9) > 0.3) ok = false;
      if (columnDarkExact(b, x, z.top - space * 0.9, z.top - space * 0.35) > 0.3) ok = false;
    }
    if (ok) hits.push(x);
  }
  // Neighbouring columns are one bar line (a double or final bar line counts once).
  let run: number[] = [];
  // A bar line stands alone. Just beside it the staff is mostly empty, so wide
  // shapes that fill the staff (time signature digits, a C clef) don't count,
  // and neither does a stem that happens to span the staff exactly: it has a
  // note head or a beam at one end.
  const share = (x0: number, x1: number, y0: number, y1: number) => {
    let n = 0;
    let all = 0;
    for (let x = Math.round(x0); x <= Math.round(x1); x++) {
      if (x < 0 || x >= b.w) continue;
      n += columnDarkExact(b, x, y0, y1);
      all++;
    }
    return all ? n / all : 0;
  };
  // How busy it is just beside a run of columns (0 = clear), or null when it's
  // too busy to be a bar line.
  const clutter = (a: number, z: number): number | null => {
    let sum = 0;
    for (const s of sys)
      for (const [x0, x1] of [
        [a - space * 0.8, a - space * 0.25],
        [z + space * 0.25, z + space * 0.8],
      ]) {
        const mid = share(x0, x1, s.top, s.bottom);
        const top = share(x0, x1, s.top - space * 0.5, s.top + space);
        const bottom = share(x0, x1, s.bottom - space, s.bottom + space * 0.5);
        if (mid > 0.5 || top > 0.45 || bottom > 0.45) return null;
        sum += mid + top + bottom;
      }
    return sum;
  };
  const found: { x: number; clutter: number }[] = [];
  const flush = () => {
    const c = run.length ? clutter(run[0], run[run.length - 1]) : null;
    if (c !== null) found.push({ x: (run[0] + run[run.length - 1]) / 2, clutter: c });
    run = [];
  };
  for (const x of hits) {
    if (run.length && x - run[run.length - 1] > space * 0.9) flush();
    run.push(x);
  }
  flush();
  // No bar is narrower than a couple of staff spaces: of two lines that close,
  // the clearer one is the bar line and the other a stem beside it.
  const xs: number[] = [];
  let lastClutter = 0;
  for (const f of found) {
    if (xs.length && f.x - xs[xs.length - 1] < space * 2) {
      if (f.clutter < lastClutter) {
        xs[xs.length - 1] = f.x;
        lastClutter = f.clutter;
      }
      continue;
    }
    xs.push(f.x);
    lastClutter = f.clutter;
  }
  // The system's own two ends (the opening line, the final bar line) aren't dividers.
  return { left, right, xs: xs.filter((x) => x > left + space * 1.5 && x < right - space * 1.5) };
}

/**
 * Staff systems (lines of music) on a page, top to bottom, with their bar
 * lines. Pass the page's RGBA pixels; about 1,200–1,600 pixels wide works best.
 */
export function detectBars(rgba: Uint8ClampedArray | Uint8Array, w: number, h: number): DetectedLine[] {
  const raw = toBitmap(rgba, w, h);
  const t = findTilt(raw);
  const b = unslant(raw, t);
  lean = -t;
  const staves = findStaves(b);
  const systems = groupSystems(b, staves);
  const r = (v: number) => Math.round(v * 10000) / 10000;
  return systems.map((sys) => {
    const { left, right, xs } = barLines(b, sys);
    // Back to page coordinates, taking the tilt at the middle of the line.
    const dy = ((left + right) / 2) * t;
    return {
      top: r((sys[0].top + dy) / h),
      bottom: r((sys[sys.length - 1].bottom + dy) / h),
      left: r(left / w),
      right: r(right / w),
      dividers: xs.map((x) => r(x / w)),
      staves: sys.length,
    };
  });
}
