"use client";

import { useEffect, useRef, useState } from "react";
import { detectPitch, levelDb } from "@/lib/practice/pitch";
import { QUIET_DB } from "@/lib/practice/activity";
import { TUNED_CENTS, hzOf, nearestTuneNote, type TuneNote } from "@/lib/practice/tuner";
import { Button, cx } from "@/components/ui";

// The tuner on the Practice session card. It listens through an analyser
// the card hands it (its own microphone before Start, the recording's
// microphone during practice), shows the note, a needle in cents from
// A = 440, and a button per string that plays the string's note. Each
// string's last steady reading is passed up so the session can record
// that the instrument was tuned.

const TICK_MS = 70;
/** Readings that must agree before a string's reading is kept (about 0.6 s). */
const STEADY_READINGS = 8;
const STEADY_SPREAD = 15;
/** Readings the needle averages over (about half a second). */
const NEEDLE_READINGS = 7;
/** A little louder than the recorder needs, so room noise doesn't move the needle. */
const TUNER_QUIET_DB = QUIET_DB + 4;

const NOTE_NAMES = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];

/** Milliseconds on the page clock (kept outside the component for the lint rules). */
function nowMs(): number {
  return performance.now();
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

type Reading = { midi: number; target: TuneNote | null; cents: number };

export type TunerReadings = Record<string, number>;

export function Tuner({
  ctx,
  analyser,
  notes,
  readings,
  onReading,
  onDone,
  doneLabel = "Done tuning",
}: {
  ctx: AudioContext;
  analyser: AnalyserNode;
  notes: TuneNote[];
  /** Last steady reading per string, in cents (kept by the card). */
  readings: TunerReadings;
  onReading: (name: string, cents: number) => void;
  onDone: () => void;
  doneLabel?: string;
}) {
  const [shown, setShown] = useState<Reading | null>(null);
  const [tone, setTone] = useState<string | null>(null);
  const toneRef = useRef<{ name: string; stop: () => void } | null>(null);
  const toneUntilRef = useRef(0);
  const onReadingRef = useRef(onReading);
  useEffect(() => {
    onReadingRef.current = onReading;
  }, [onReading]);

  // Listen.
  useEffect(() => {
    const buf = new Float32Array(analyser.fftSize);
    const lowest = Math.min(...notes.map((n) => hzOf(n.midi)));
    const minHz = Math.min(60, lowest * 0.8);
    let recent: Reading[] = [];
    let lastHeard = 0;
    const id = window.setInterval(() => {
      // Don't listen to our own reference note.
      if (performance.now() < toneUntilRef.current) {
        recent = [];
        return;
      }
      analyser.getFloatTimeDomainData(buf);
      const p = levelDb(buf) > TUNER_QUIET_DB ? detectPitch(buf, ctx.sampleRate, minHz) : null;
      if (!p) {
        if (performance.now() - lastHeard > 1200) {
          recent = [];
          setShown(null);
        }
        return;
      }
      lastHeard = performance.now();
      const near = nearestTuneNote(p.midi, notes);
      const r: Reading = near
        ? { midi: p.midi, target: near.note, cents: near.cents }
        : { midi: p.midi, target: null, cents: (p.midi - Math.round(p.midi)) * 100 };
      recent = [...recent, r].slice(-Math.max(STEADY_READINGS, NEEDLE_READINGS));
      // Show the median of the last few, so the needle doesn't jitter.
      const same = recent.filter((x) => x.target?.name === r.target?.name && Math.round(x.midi) === Math.round(r.midi));
      const last = same.slice(-NEEDLE_READINGS);
      setShown({ ...r, cents: median(last.map((x) => x.cents)) });
      if (
        r.target &&
        same.length >= STEADY_READINGS &&
        Math.max(...same.map((x) => x.cents)) - Math.min(...same.map((x) => x.cents)) <= STEADY_SPREAD
      ) {
        onReadingRef.current(r.target.name, Math.round(median(same.map((x) => x.cents))));
      }
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [analyser, ctx, notes]);

  // Stop a reference note when the tuner closes.
  useEffect(() => () => toneRef.current?.stop(), []);

  function playTone(n: TuneNote) {
    const playing = toneRef.current;
    playing?.stop();
    if (playing?.name === n.name) return;
    ctx.resume().catch(() => {});
    // A bright tone through a soft filter: a plain sine at cello C (65 Hz)
    // can't be heard on a phone speaker; its overtones can.
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = hzOf(n.midi);
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 2400;
    const gain = ctx.createGain();
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.18, now + 0.05);
    gain.gain.setValueAtTime(0.18, now + 3.5);
    gain.gain.linearRampToValueAtTime(0, now + 4);
    osc.connect(filter).connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 4.05);
    toneUntilRef.current = nowMs() + 4400;
    const stop = () => {
      try {
        gain.gain.cancelScheduledValues(ctx.currentTime);
        gain.gain.setValueAtTime(0, ctx.currentTime);
        osc.stop();
      } catch {}
      toneUntilRef.current = nowMs() + 300;
      if (toneRef.current?.name === n.name) toneRef.current = null;
      setTone((t) => (t === n.name ? null : t));
    };
    osc.onended = stop;
    toneRef.current = { name: n.name, stop };
    setTone(n.name);
  }

  const cents = shown ? Math.round(shown.cents) : null;
  const inTune = cents !== null && Math.abs(cents) <= TUNED_CENTS;
  const label = shown
    ? shown.target
      ? shown.target.name
      : NOTE_NAMES[((Math.round(shown.midi) % 12) + 12) % 12]
    : "–";
  const clamped = cents === null ? 0 : Math.max(-50, Math.min(50, cents));
  const angle = (clamped / 50) * 60;
  const strings = notes.length > 1;

  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-plum/30 bg-sheet px-3 py-4">
      <div className="text-sm font-semibold tracking-wide text-muted">TUNER · A = 440</div>

      {/* Needle */}
      <svg viewBox="0 0 240 140" className="w-full max-w-[320px]" aria-hidden>
        <path d="M 30 120 A 90 90 0 0 1 210 120" fill="none" stroke="var(--rule)" strokeWidth="14" strokeLinecap="round" />
        {/* The in-tune zone, ±TUNED_CENTS of the 120° arc. */}
        <path
          d={arc(120, 120, 90, -(TUNED_CENTS / 50) * 60, (TUNED_CENTS / 50) * 60)}
          fill="none"
          stroke="var(--sage)"
          strokeWidth="14"
        />
        {[-50, -25, 0, 25, 50].map((c) => {
          const a = ((c / 50) * 60 * Math.PI) / 180;
          return (
            <line
              key={c}
              x1={120 + Math.sin(a) * 74}
              y1={120 - Math.cos(a) * 74}
              x2={120 + Math.sin(a) * 66}
              y2={120 - Math.cos(a) * 66}
              stroke="var(--muted)"
              strokeWidth="2"
            />
          );
        })}
        <g
          style={{ transform: `rotate(${angle}deg)`, transformOrigin: "120px 120px", transition: "transform 200ms ease-out" }}
          opacity={shown ? 1 : 0.25}
        >
          <line x1="120" y1="120" x2="120" y2="38" stroke={inTune ? "var(--sage)" : "var(--ink)"} strokeWidth="4" strokeLinecap="round" />
        </g>
        <circle cx="120" cy="120" r="7" fill="var(--ink)" />
        <text x="30" y="138" fontSize="12" textAnchor="middle" fill="var(--muted)">
          flat
        </text>
        <text x="210" y="138" fontSize="12" textAnchor="middle" fill="var(--muted)">
          sharp
        </text>
      </svg>

      <div className="-mt-2 flex items-baseline gap-3">
        <span className={cx("font-display text-6xl font-semibold leading-none", inTune && "text-sage")}>{label}</span>
        {cents !== null && (
          <span className="font-mono text-2xl tabular-nums text-muted">
            {cents > 0 ? "+" : cents < 0 ? "−" : "±"}
            {Math.abs(cents)}
          </span>
        )}
      </div>
      <div className={cx("min-h-7 text-center text-xl font-semibold", inTune ? "text-sage" : "text-ink")}>
        {cents === null
          ? strings
            ? "Play one open string, slowly and steadily"
            : "Play an A, long and steady"
          : !shown?.target
            ? strings
              ? "That's not an open string"
              : "Play an A"
            : inTune
              ? "In tune ✓"
              : cents > 0
                ? "Too high · tune down"
                : "Too low · tune up"}
      </div>

      <div className="grid w-full gap-2" style={{ gridTemplateColumns: `repeat(${notes.length}, minmax(0, 1fr))` }}>
        {notes.map((n) => {
          const r = readings[n.name];
          const ok = r !== undefined && Math.abs(r) <= TUNED_CENTS;
          return (
            <button
              key={n.name}
              type="button"
              onClick={() => playTone(n)}
              className={cx(
                "flex min-h-16 flex-col items-center justify-center rounded-xl border-2 px-1 py-1 transition active:scale-[0.98]",
                ok ? "border-sage bg-sage-soft" : "border-rule bg-paper",
                tone === n.name && "border-plum bg-plum-soft",
                shown?.target?.name === n.name && !ok && "border-plum/60",
              )}
              aria-label={`${n.name} string: play its note`}
            >
              <span className="font-display text-2xl font-semibold leading-none">{n.name}</span>
              <span className={cx("mt-1 text-sm tabular-nums", ok ? "text-sage" : "text-muted")}>
                {tone === n.name ? "♪ playing" : ok ? "✓" : r !== undefined ? `${r > 0 ? "+" : "−"}${Math.abs(r)}` : "not yet"}
              </span>
            </button>
          );
        })}
      </div>
      <div className="text-center text-sm text-muted">
        Tap {strings ? "a string" : "the A"} to hear its note. A string is ticked when it sits within {TUNED_CENTS} cents.
      </div>

      <Button type="button" variant="secondary" className="min-h-12 w-full text-lg" onClick={onDone}>
        {doneLabel}
      </Button>
    </div>
  );
}

/** An SVG arc on the gauge, from one angle to another (degrees, 0 = straight up). */
function arc(cx: number, cy: number, r: number, from: number, to: number): string {
  const pt = (deg: number) => {
    const a = (deg * Math.PI) / 180;
    return `${cx + Math.sin(a) * r} ${cy - Math.cos(a) * r}`;
  };
  return `M ${pt(from)} A ${r} ${r} 0 0 1 ${pt(to)}`;
}
