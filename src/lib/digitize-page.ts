// Browser only: turns a photo of a page of music into a clean "scanned" page.
// 1. Finds the sheet of paper in the photo (the biggest bright area) and its
//    four corners, and flattens it to a straight rectangle (perspective).
// 2. Straightens what's left of a tilt so the staff lines run level.
// 3. Evens out the lighting (shadows, a yellow lamp, a dark corner) so the
//    paper is flat white and the notes are crisp black.
// The result keeps `fit` (see page-fit.ts), so boxes drawn on the photo can be
// moved onto the clean page.

import { homography, invert, mul, scale, type Mat3 } from "@/lib/page-fit";

const MAX_OUT = 2000; // long edge of the clean page, like the stored photos
const JPEG_QUALITY = 0.85;

export type DigitizeOptions = {
  /** Don't look for the page edges: straighten and clean the whole photo. */
  wholePhoto?: boolean;
};
export type Digitized = { blob: Blob; w: number; h: number; fit: Mat3; cropped: boolean };

type Gray = { data: Uint8ClampedArray; w: number; h: number; /** 1 where the pixel came from the photo. */ inside?: Uint8Array };
type Pt = [number, number];

function grayFrom(source: CanvasImageSource, sw: number, sh: number, w: number, h: number): Gray {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, sw, sh, 0, 0, w, h);
  const rgba = ctx.getImageData(0, 0, w, h).data;
  const data = new Uint8ClampedArray(w * h);
  for (let i = 0, j = 0; i < data.length; i++, j += 4) {
    data[i] = (rgba[j] * 299 + rgba[j + 1] * 587 + rgba[j + 2] * 114) / 1000;
  }
  return { data, w, h };
}

function otsu(data: Uint8ClampedArray): number {
  const hist = new Array(256).fill(0);
  for (const v of data) hist[v]++;
  const total = data.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let t = 128;
  for (let i = 0; i < 256; i++) {
    wB += hist[i];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += i * hist[i];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > best) {
      best = between;
      t = i;
    }
  }
  return t;
}

function boxBlur(g: Gray, r: number): Gray {
  const { w, h, data } = g;
  const tmp = new Float32Array(w * h);
  const out = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      let n = 0;
      for (let k = Math.max(0, x - r); k <= Math.min(w - 1, x + r); k++, n++) s += data[y * w + k];
      tmp[y * w + x] = s / n;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let s = 0;
      let n = 0;
      for (let k = Math.max(0, y - r); k <= Math.min(h - 1, y + r); k++, n++) s += tmp[k * w + x];
      out[y * w + x] = s / n;
    }
  }
  return { data: out, w, h };
}

const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

function quadArea(q: Pt[]): number {
  let s = 0;
  for (let i = 0; i < 4; i++) s += q[i][0] * q[(i + 1) % 4][1] - q[(i + 1) % 4][0] * q[i][1];
  return Math.abs(s) / 2;
}

/** Corners of the sheet (TL, TR, BR, BL) in the small image, or null when it can't be told apart from the background. */
function findPage(small: Gray): Pt[] | null {
  const { w, h } = small;
  const blurred = boxBlur(small, 2);
  const t = otsu(blurred.data);
  // Too little contrast between paper and background to tell where the sheet ends.
  const labels = new Int32Array(w * h).fill(-1);
  let bestLabel = -1;
  let bestCount = 0;
  const stack = new Int32Array(w * h);
  let label = 0;
  for (let start = 0; start < w * h; start++) {
    if (labels[start] !== -1 || blurred.data[start] <= t) continue;
    let top = 0;
    stack[top++] = start;
    labels[start] = label;
    let count = 0;
    while (top) {
      const i = stack[--top];
      count++;
      const x = i % w;
      const y = (i - x) / w;
      const near = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1];
      for (const j of near) {
        if (j >= 0 && labels[j] === -1 && blurred.data[j] > t) {
          labels[j] = label;
          stack[top++] = j;
        }
      }
    }
    if (count > bestCount) {
      bestCount = count;
      bestLabel = label;
    }
    label++;
  }
  if (bestLabel < 0 || bestCount < 0.2 * w * h) return null;

  let tl: Pt = [0, 0], tr: Pt = [0, 0], br: Pt = [0, 0], bl: Pt = [0, 0];
  let minSum = Infinity, maxSum = -Infinity, minDiff = Infinity, maxDiff = -Infinity;
  for (let i = 0; i < w * h; i++) {
    if (labels[i] !== bestLabel) continue;
    const x = i % w;
    const y = (i - x) / w;
    if (x + y < minSum) [minSum, tl] = [x + y, [x, y]];
    if (x + y > maxSum) [maxSum, br] = [x + y, [x, y]];
    if (x - y > maxDiff) [maxDiff, tr] = [x - y, [x, y]];
    if (x - y < minDiff) [minDiff, bl] = [x - y, [x, y]];
  }
  const q: Pt[] = [tl, tr, br, bl];
  const area = quadArea(q);
  // The sheet fills the photo already (a scan, a PDF, a close-up).
  if (area > 0.93 * w * h) return null;
  if (area < 0.2 * w * h) return null;
  // Most of the quad should be paper, or the corners came from something else.
  if (bestCount / area < 0.6) return null;
  // Convex, with corners near square (a photo taken from an angle is fine).
  const signs = q.map((p, i) => Math.sign(cross(p, q[(i + 1) % 4], q[(i + 2) % 4])));
  if (signs.some((s) => s !== signs[0] || s === 0)) return null;
  for (let i = 0; i < 4; i++) {
    const p = q[i];
    const a = q[(i + 3) % 4];
    const b = q[(i + 1) % 4];
    const v1 = [a[0] - p[0], a[1] - p[1]];
    const v2 = [b[0] - p[0], b[1] - p[1]];
    const cos = (v1[0] * v2[0] + v1[1] * v2[1]) / (Math.hypot(v1[0], v1[1]) * Math.hypot(v2[0], v2[1]) || 1);
    const deg = (Math.acos(Math.min(1, Math.max(-1, cos))) * 180) / Math.PI;
    if (deg < 55 || deg > 125) return null;
  }
  // Pull the corners in a touch so the paper's edge and its shadow stay out.
  const cx = q.reduce((s, p) => s + p[0], 0) / 4;
  const cy = q.reduce((s, p) => s + p[1], 0) / 4;
  return q.map(([x, y]) => [x + (cx - x) * 0.012, y + (cy - y) * 0.012] as Pt);
}

/** Samples the source at (x, y) with bilinear filtering; outside the photo is white paper. */
function sample(src: Gray, x: number, y: number): number {
  if (x < 0 || y < 0 || x > src.w - 1 || y > src.h - 1) return 255;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, src.w - 1);
  const y1 = Math.min(y0 + 1, src.h - 1);
  const fx = x - x0;
  const fy = y - y0;
  const d = src.data;
  const a = d[y0 * src.w + x0] * (1 - fx) + d[y0 * src.w + x1] * fx;
  const b = d[y1 * src.w + x0] * (1 - fx) + d[y1 * src.w + x1] * fx;
  return a * (1 - fy) + b * fy;
}

/** Fills a w×h image where each pixel comes from `m` (output pixel → source pixel). */
function warp(src: Gray, m: Mat3, w: number, h: number): Gray {
  const data = new Uint8ClampedArray(w * h);
  const inside = new Uint8Array(w * h);
  const [a, b, c, d, e, f, g, hh, i] = m;
  for (let y = 0; y < h; y++) {
    const py = y + 0.5;
    for (let x = 0; x < w; x++) {
      const px = x + 0.5;
      const z = g * px + hh * py + i || 1e-12;
      const sx = (a * px + b * py + c) / z;
      const sy = (d * px + e * py + f) / z;
      data[y * w + x] = sample(src, sx - 0.5, sy - 0.5);
      if (sx >= 1.5 && sy >= 1.5 && sx <= src.w - 1.5 && sy <= src.h - 1.5) inside[y * w + x] = 1;
    }
  }
  return { data, w, h, inside };
}

/** The small tilt (radians) that makes the staff lines level, found by trying angles. */
function findTilt(g: Gray): number {
  const t = Math.min(otsu(g.data), 160);
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < g.data.length; i++) {
    if (g.data[i] < t) {
      xs.push((i % g.w) - g.w / 2);
      ys.push(Math.floor(i / g.w) - g.h / 2);
    }
  }
  const share = xs.length / g.data.length;
  if (share < 0.004 || share > 0.4) return 0;
  const size = Math.ceil(Math.hypot(g.w, g.h)) + 2;
  const hist = new Float64Array(size);
  let best = 0;
  let bestScore = -1;
  for (let deg = -5; deg <= 5.0001; deg += 0.2) {
    const a = (deg * Math.PI) / 180;
    const s = Math.sin(a);
    const c = Math.cos(a);
    hist.fill(0);
    for (let k = 0; k < xs.length; k++) hist[Math.round(xs[k] * s + ys[k] * c + size / 2)]++;
    let score = 0;
    for (const v of hist) score += v * v;
    if (score > bestScore) {
      bestScore = score;
      best = a;
    }
  }
  return best;
}

/** Evens out the lighting and turns the paper white and the ink black. */
function clean(g: Gray): Uint8ClampedArray {
  const { w, h, data } = g;
  const inside = g.inside;
  const B = Math.max(16, Math.round(Math.max(w, h) / 48));
  const gx = Math.ceil(w / B);
  const gy = Math.ceil(h / B);
  const grid = new Float32Array(gx * gy);
  const hist = new Uint32Array(256);
  for (let by = 0; by < gy; by++) {
    for (let bx = 0; bx < gx; bx++) {
      hist.fill(0);
      let n = 0;
      for (let y = by * B; y < Math.min(h, (by + 1) * B); y++)
        for (let x = bx * B; x < Math.min(w, (bx + 1) * B); x++) {
          // Corners left blank by straightening aren't paper; leave them out.
          if (inside && !inside[y * w + x]) continue;
          hist[data[y * w + x]]++;
          n++;
        }
      if (n < (B * B) / 3) {
        grid[by * gx + bx] = 0; // filled from the neighbours below
        continue;
      }
      // The paper's brightness here: a high percentile, so notes don't count.
      let want = n * 0.1;
      let v = 255;
      for (; v > 0; v--) {
        want -= hist[v];
        if (want <= 0) break;
      }
      grid[by * gx + bx] = v;
    }
  }
  // Blocks full of ink (a thick title, a dense run of beams) borrow from their neighbours.
  const grown = new Float32Array(gx * gy);
  for (let y = 0; y < gy; y++)
    for (let x = 0; x < gx; x++) {
      let m = 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const yy = y + dy;
          const xx = x + dx;
          if (yy >= 0 && yy < gy && xx >= 0 && xx < gx) m = Math.max(m, grid[yy * gx + xx]);
        }
      // Only fills in for ink-heavy blocks; never brighter than a shade above its own paper.
      const own = grid[y * gx + x];
      grown[y * gx + x] = own ? Math.min(m, own * 1.12) : m || 255;
    }
  const smooth = new Float32Array(gx * gy);
  for (let y = 0; y < gy; y++)
    for (let x = 0; x < gx; x++) {
      let s = 0;
      let n = 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const yy = y + dy;
          const xx = x + dx;
          if (yy >= 0 && yy < gy && xx >= 0 && xx < gx) {
            s += grown[yy * gx + xx];
            n++;
          }
        }
      smooth[y * gx + x] = Math.max(s / n, 40);
    }
  const out = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y++) {
    const fy = Math.min(Math.max((y + 0.5) / B - 0.5, 0), gy - 1);
    const y0 = Math.floor(fy);
    const y1 = Math.min(y0 + 1, gy - 1);
    const ty = fy - y0;
    for (let x = 0; x < w; x++) {
      const fx = Math.min(Math.max((x + 0.5) / B - 0.5, 0), gx - 1);
      const x0 = Math.floor(fx);
      const x1 = Math.min(x0 + 1, gx - 1);
      const tx = fx - x0;
      const bg =
        (smooth[y0 * gx + x0] * (1 - tx) + smooth[y0 * gx + x1] * tx) * (1 - ty) +
        (smooth[y1 * gx + x0] * (1 - tx) + smooth[y1 * gx + x1] * tx) * ty;
      if (inside && !inside[y * w + x]) {
        out[y * w + x] = 255;
        continue;
      }
      const n = data[y * w + x] / bg;
      const t = Math.min(Math.max((n - 0.38) / (0.86 - 0.38), 0), 1);
      out[y * w + x] = 255 * Math.pow(t, 1.4);
    }
  }
  return out;
}

/**
 * Digitizes one page. `source` is the photo (already turned upright), drawn
 * at `sw`×`sh`.
 */
export async function digitizePage(
  source: CanvasImageSource,
  sw: number,
  sh: number,
  opts: DigitizeOptions = {},
): Promise<Digitized> {
  const workScale = Math.min(1, 2400 / Math.max(sw, sh));
  const W0 = Math.round(sw * workScale);
  const H0 = Math.round(sh * workScale);
  const src = grayFrom(source, sw, sh, W0, H0);

  // Find the sheet on a small copy.
  const k = Math.min(1, 480 / Math.max(W0, H0));
  const small = grayFrom(source, sw, sh, Math.max(8, Math.round(W0 * k)), Math.max(8, Math.round(H0 * k)));
  const found = opts.wholePhoto ? null : findPage(small);
  const quad: Pt[] = found
    ? found.map(([x, y]) => [(x / small.w) * W0, (y / small.h) * H0] as Pt)
    : [
        [0, 0],
        [W0, 0],
        [W0, H0],
        [0, H0],
      ];
  const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  let outW = Math.max(dist(quad[0], quad[1]), dist(quad[3], quad[2]));
  let outH = Math.max(dist(quad[0], quad[3]), dist(quad[1], quad[2]));
  const s = Math.min(1, MAX_OUT / Math.max(outW, outH));
  outW = Math.max(1, Math.round(outW * s));
  outH = Math.max(1, Math.round(outH * s));

  // Output pixel → photo pixel.
  const flat = homography(
    [
      [0, 0],
      [outW, 0],
      [outW, outH],
      [0, outH],
    ],
    quad,
  );
  if (!flat) throw new Error("Couldn't straighten that page.");

  // Level the staff lines.
  const ks = Math.min(1, 700 / Math.max(outW, outH));
  const sw2 = Math.max(8, Math.round(outW * ks));
  const sh2 = Math.max(8, Math.round(outH * ks));
  const preview = warp(src, mul(flat, scale(outW / sw2, outH / sh2)), sw2, sh2);
  const tilt = findTilt(preview);
  const c = Math.cos(tilt);
  const sn = Math.sin(tilt);
  const cx = outW / 2;
  const cy = outH / 2;
  // Output pixel q takes the flattened pixel at Rot(-tilt)(q - C) + C.
  const level: Mat3 = [c, sn, cx - c * cx - sn * cy, -sn, c, cy + sn * cx - c * cy, 0, 0, 1];
  const m = mul(flat, level);

  const page = warp(src, m, outW, outH);
  const ink = clean(page);

  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(outW, outH);
  for (let i = 0, j = 0; i < ink.length; i++, j += 4) {
    img.data[j] = img.data[j + 1] = img.data[j + 2] = ink[i];
    img.data[j + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode"))), "image/jpeg", JPEG_QUALITY),
  );

  // Clean page (fractions) → photo (fractions), then turned round for `fit`.
  const back = mul(scale(1 / W0, 1 / H0), mul(m, scale(outW, outH)));
  const fit = invert(back);
  if (!fit) throw new Error("Couldn't straighten that page.");
  return { blob, w: outW, h: outH, fit: fit.map((v) => +v.toPrecision(8)), cropped: !!found };
}

/** Loads an image (a picked file or a downloaded page) upright, for digitizing. */
export async function loadForDigitize(blob: Blob): Promise<{ source: CanvasImageSource; w: number; h: number }> {
  try {
    const bmp = await createImageBitmap(blob, { imageOrientation: "from-image" });
    return { source: bmp, w: bmp.width, h: bmp.height };
  } catch {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.src = url;
    await img.decode();
    URL.revokeObjectURL(url);
    return { source: img, w: img.naturalWidth, h: img.naturalHeight };
  }
}
