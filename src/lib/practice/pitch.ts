// Small pitch detector for the practice recorder (YIN, de Cheveigné &
// Kawahara 2002). Tells which note is sounding on a cello, violin or piano
// melody; with a longer buffer (4096 samples) it is steady enough for the
// tuner too.

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const MIN_HZ = 60; // below cello C2 (65 Hz)
const MAX_HZ = 2100; // around C7
const THRESHOLD = 0.15;

/** midi is fractional (45.12 = A2, 12 cents sharp). */
export type Pitch = { hz: number; note: string; cents: number; midi: number };

export function levelDb(buf: Float32Array): number {
  let peak = 0;
  for (let i = 0; i < buf.length; i++) {
    const v = Math.abs(buf[i]);
    if (v > peak) peak = v;
  }
  return peak > 0 ? 20 * Math.log10(peak) : -100;
}

export function detectPitch(buf: Float32Array, sampleRate: number, minHz = MIN_HZ): Pitch | null {
  const W = Math.floor(buf.length / 2);
  const minTau = Math.max(2, Math.floor(sampleRate / MAX_HZ));
  const maxTau = Math.min(W - 1, Math.floor(sampleRate / minHz));
  if (maxTau <= minTau) return null;

  const d = new Float32Array(maxTau + 1);
  for (let tau = 1; tau <= maxTau; tau++) {
    let sum = 0;
    for (let i = 0; i < W; i++) {
      const diff = buf[i] - buf[i + tau];
      sum += diff * diff;
    }
    d[tau] = sum;
  }
  // Cumulative mean normalised difference.
  let running = 0;
  d[0] = 1;
  for (let tau = 1; tau <= maxTau; tau++) {
    running += d[tau];
    d[tau] = running ? (d[tau] * tau) / running : 1;
  }
  // First dip under the threshold, then down to its lowest point.
  let tauEstimate = -1;
  for (let tau = minTau; tau <= maxTau; tau++) {
    if (d[tau] < THRESHOLD) {
      while (tau + 1 <= maxTau && d[tau + 1] < d[tau]) tau++;
      tauEstimate = tau;
      break;
    }
  }
  if (tauEstimate < 0) return null;

  // Parabolic interpolation around the minimum.
  const t = tauEstimate;
  let better = t;
  if (t > 1 && t < maxTau) {
    const a = d[t - 1];
    const b = d[t];
    const c = d[t + 1];
    const denom = a + c - 2 * b;
    if (denom) better = t + (a - c) / (2 * denom);
  }
  const hz = sampleRate / better;
  if (!Number.isFinite(hz) || hz < minHz || hz > MAX_HZ) return null;
  const midi = 69 + 12 * Math.log2(hz / 440);
  const nearest = Math.round(midi);
  return {
    hz,
    note: `${NOTE_NAMES[((nearest % 12) + 12) % 12]}${Math.floor(nearest / 12) - 1}`,
    cents: Math.round((midi - nearest) * 100),
    midi,
  };
}
