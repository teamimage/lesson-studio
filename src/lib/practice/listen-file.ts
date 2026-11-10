// Works out a practice sound timeline from a finished recording, in the
// browser: the same once-a-second level and notes the practice recorder
// writes down live (see practice-recorder.tsx), so a recording first saved as
// a lesson can get a full practice review after it is switched.
//
// The file is decoded at 16 kHz: enough for note names (cello C2 to
// about C7) and small enough for a 45-minute recording on a phone.

import { QUIET_DB, type ActivitySecond } from "./activity";
import { detectPitch, levelDb } from "./pitch";

const RATE = 16000;
const LOOKS_PER_SECOND = 20; // as the live recorder (50 ms ticks)
const FRAME = 1024;

export async function activityFromFile(url: string, onProgress?: (fraction: number) => void): Promise<ActivitySecond[]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Couldn't download the recording.");
  const bytes = await res.arrayBuffer();
  const Offline =
    window.OfflineAudioContext ??
    (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext;
  if (!Offline) throw new Error("This browser can't listen through recordings.");
  const ctx = new Offline(1, RATE, RATE);
  const audio = await new Promise<AudioBuffer>((resolve, reject) => {
    // Older Safari only has the callback form.
    const p = ctx.decodeAudioData(bytes, resolve, reject);
    if (p && typeof p.then === "function") p.then(resolve, reject);
  });
  const rate = audio.sampleRate;
  const channels = Array.from({ length: audio.numberOfChannels }, (_, i) => audio.getChannelData(i));
  const seconds = Math.floor(audio.length / rate);
  const buf = new Float32Array(FRAME);
  const out: ActivitySecond[] = [];

  for (let sec = 0; sec < seconds; sec++) {
    let db = -100;
    const notes: string[] = [];
    const cents: number[] = [];
    const fine: number[] = [];
    for (let k = 0; k < LOOKS_PER_SECOND; k++) {
      const start = Math.floor((sec + k / LOOKS_PER_SECOND) * rate);
      if (start + FRAME > audio.length) break;
      for (let i = 0; i < FRAME; i++) {
        let v = 0;
        for (const ch of channels) v += ch[start + i];
        buf[i] = v / channels.length;
      }
      const level = levelDb(buf);
      db = Math.max(db, level);
      let reading = 0;
      if (level > QUIET_DB) {
        const p = detectPitch(buf, rate);
        if (p) {
          if (notes[notes.length - 1] !== p.note && notes.length < 20) notes.push(p.note);
          cents.push(p.cents);
          reading = Math.round(p.midi * 100);
        }
      }
      fine.push(reading);
    }
    const c = cents.length ? cents.reduce((s, v) => s + Math.abs(v), 0) / cents.length : undefined;
    out.push({
      t: sec,
      db: Math.round(db),
      n: notes,
      ...(c !== undefined ? { c: Math.round(c) } : {}),
      ...(fine.some((v) => v > 0) ? { p: fine } : {}),
    });
    // Let the page breathe (and show progress) every minute of audio.
    if (sec % 60 === 59) {
      onProgress?.(sec / seconds);
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  onProgress?.(1);
  return out;
}
