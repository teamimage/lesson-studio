// Shared (client + server): the geometry between an original music photo and
// its digitized page. Digitizing finds the sheet in the photo, straightens it
// and crops to it, so a spot on the photo lands somewhere else on the clean
// page. Each digitized page keeps `fit`, a 3×3 matrix (row-major) taking a
// point on the original (as fractions of its width and height) to the same
// point on the digitized page. Boxes saved against the old geometry (stand
// marks, highlighted bars, the bar map) are moved with it when a page is
// digitized again.

export type Mat3 = number[]; // 9 numbers, row-major

export const IDENTITY: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

export function isMat3(v: unknown): v is Mat3 {
  return Array.isArray(v) && v.length === 9 && v.every((n) => typeof n === "number" && Number.isFinite(n));
}

export function mul(a: Mat3, b: Mat3): Mat3 {
  const out: number[] = [];
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++) out.push(a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c]);
  return out;
}

export function invert(m: Mat3): Mat3 | null {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12) return null;
  const inv = [A, -(b * i - c * h), b * f - c * e, B, a * i - c * g, -(a * f - c * d), C, -(a * h - b * g), a * e - b * d];
  return inv.map((v) => v / det);
}

export function apply(m: Mat3, x: number, y: number): [number, number] {
  const w = m[6] * x + m[7] * y + m[8];
  const d = Math.abs(w) < 1e-12 ? 1e-12 : w;
  return [(m[0] * x + m[1] * y + m[2]) / d, (m[3] * x + m[4] * y + m[5]) / d];
}

export function scale(sx: number, sy: number): Mat3 {
  return [sx, 0, 0, 0, sy, 0, 0, 0, 1];
}

/** The homography taking the four `from` points to the four `to` points. */
export function homography(from: [number, number][], to: [number, number][]): Mat3 | null {
  // 8 unknowns (h33 = 1), two equations per point pair.
  const A: number[][] = [];
  for (let k = 0; k < 4; k++) {
    const [x, y] = from[k];
    const [u, v] = to[k];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }
  // Gaussian elimination with partial pivoting.
  for (let col = 0; col < 8; col++) {
    let piv = col;
    for (let r = col + 1; r < 8; r++) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
    if (Math.abs(A[piv][col]) < 1e-12) return null;
    [A[col], A[piv]] = [A[piv], A[col]];
    for (let r = 0; r < 8; r++) {
      if (r === col) continue;
      const f = A[r][col] / A[col][col];
      for (let c = col; c < 9; c++) A[r][c] -= f * A[col][c];
    }
  }
  const h = A.map((row, i) => row[8] / row[i]);
  return [...h, 1];
}

const clamp01 = (v: number) => Math.min(Math.max(v, 0), 1);

/** A box (fractions of the page) moved by `m`: the bounding box of its moved corners. */
export function mapRect<R extends { x: number; y: number; w: number; h: number }>(m: Mat3, r: R): R {
  const pts = [
    apply(m, r.x, r.y),
    apply(m, r.x + r.w, r.y),
    apply(m, r.x + r.w, r.y + r.h),
    apply(m, r.x, r.y + r.h),
  ];
  const x0 = clamp01(Math.min(...pts.map((p) => p[0])));
  const x1 = clamp01(Math.max(...pts.map((p) => p[0])));
  const y0 = clamp01(Math.min(...pts.map((p) => p[1])));
  const y1 = clamp01(Math.max(...pts.map((p) => p[1])));
  const round = (v: number) => +v.toFixed(4);
  return { ...r, x: round(x0), y: round(y0), w: round(Math.max(x1 - x0, 0.001)), h: round(Math.max(y1 - y0, 0.001)) };
}

/** A page's bar map (pages[i].bars) moved by `m`. Unknown shapes are left as they are. */
export function mapBars(m: Mat3, bars: unknown): unknown {
  if (!bars || typeof bars !== "object" || Array.isArray(bars)) return bars;
  const b = bars as Record<string, unknown>;
  if (!Array.isArray(b.lines)) return bars;
  const lines = b.lines.flatMap((l) => {
    if (!l || typeof l !== "object") return [];
    const o = l as Record<string, unknown>;
    const top = Number(o.top);
    const bottom = Number(o.bottom);
    const left = Number(o.left);
    const right = Number(o.right);
    if (![top, bottom, left, right].every(Number.isFinite)) return [];
    const box = mapRect(m, { x: left, y: top, w: right - left, h: bottom - top });
    const mid = (top + bottom) / 2;
    const dividers = (Array.isArray(o.dividers) ? o.dividers : [])
      .map((d) => apply(m, Number(d), mid)[0])
      .filter((x) => Number.isFinite(x) && x > box.x && x < box.x + box.w)
      .map((x) => +x.toFixed(4))
      .sort((a, c) => a - c);
    return [{ ...o, top: box.y, bottom: +(box.y + box.h).toFixed(4), left: box.x, right: +(box.x + box.w).toFixed(4), dividers }];
  });
  return { ...b, lines };
}

/**
 * The move from a page's old geometry to its new one, both given as `fit`
 * from the original (no fit = the original itself).
 */
export function refit(oldFit: Mat3 | null | undefined, newFit: Mat3 | null | undefined): Mat3 | null {
  const back = oldFit ? invert(oldFit) : IDENTITY;
  if (!back) return null;
  const m = mul(newFit ?? IDENTITY, back);
  // No change worth moving anything for.
  return m.every((v, i) => Math.abs(v - IDENTITY[i]) < 1e-6) ? null : m;
}
