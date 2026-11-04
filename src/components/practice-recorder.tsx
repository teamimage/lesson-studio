"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import * as tus from "tus-js-client";
import { createClient } from "@/lib/supabase/client";
import { PRACTICE_BUCKET } from "@/lib/constants";
import { toISODate } from "@/lib/format";
import { clock, QUIET_DB, type ActivitySecond } from "@/lib/practice/activity";
import { detectPitch, levelDb } from "@/lib/practice/pitch";
import { attachPracticeRecording, createPracticeSession, finishPracticeUpload } from "@/app/family/practice-actions";
import { TUNED_CENTS, TUNING_VALID_SECONDS, tuneNotesFor, type TuningCheck } from "@/lib/practice/tuner";
import { Button, Card, cx } from "@/components/ui";
import { Tuner, type TunerReadings } from "@/components/tuner";

// Start practice / Stop practice. Records audio (or video with audio) in the
// browser, writes down a once-a-second sound timeline while it records, and
// at Stop uploads the file for the AI to review. The recording is deleted
// after the review; only the review is kept.
//
// The tuner sits on the same card: before Start (with its own microphone)
// and during practice (listening through the recording's microphone). Each
// time it is closed, the strings' readings are kept as a tuning check and
// sent with the session, so the review judges notes against A = 440.

const CHUNK_SIZE = 6 * 1024 * 1024;
const MAX_SECONDS = 2 * 60 * 60;
// Twenty looks a second: enough readings per note to tell sharp from flat.
const TICK_MS = 50;

type Phase =
  | { name: "idle" }
  | { name: "starting" }
  | { name: "recording" }
  | { name: "uploading"; progress: number }
  | { name: "reviewing"; sessionId: string }
  | { name: "done"; counted: boolean | null }
  | { name: "error"; message: string; retry?: () => void };

const AUDIO_TYPES = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];
const VIDEO_TYPES = ["video/mp4", "video/webm;codecs=vp8,opus", "video/webm"];

function pickType(video: boolean): string {
  const list = video ? VIDEO_TYPES : AUDIO_TYPES;
  if (typeof MediaRecorder === "undefined") return "";
  return list.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
}

function extensionOf(type: string): string {
  const base = type.split(";")[0];
  if (base === "audio/mp4") return "m4a";
  if (base === "video/mp4") return "mp4";
  if (base === "audio/ogg") return "ogg";
  return "webm";
}

function resumableEndpoint(): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(/\/$/, "");
  const direct = base.replace(/^https:\/\/([a-z0-9]+)\.supabase\.co$/, "https://$1.storage.supabase.co");
  return `${direct}/storage/v1/upload/resumable`;
}

type TunerAudio = { ctx: AudioContext; analyser: AnalyserNode; own: MediaStream | null };

type StoredCheck = { wall: number; s: TunerReadings; ok: boolean };

function storageKey(studentId: string) {
  return `ls-tuning:${studentId}`;
}

/** Tuning checks from the last half hour, kept in this browser so a reload doesn't lose them. */
function loadChecks(studentId: string): StoredCheck[] {
  try {
    const raw = JSON.parse(window.localStorage.getItem(storageKey(studentId)) ?? "[]") as StoredCheck[];
    const since = Date.now() - TUNING_VALID_SECONDS * 1000;
    return Array.isArray(raw) ? raw.filter((c) => c && typeof c.wall === "number" && c.wall >= since) : [];
  } catch {
    return [];
  }
}

function saveChecks(studentId: string, checks: StoredCheck[]) {
  try {
    window.localStorage.setItem(storageKey(studentId), JSON.stringify(checks.slice(-10)));
  } catch {}
}

export function PracticeRecorder({
  studentId,
  firstName,
  hasPlan,
  instrument,
}: {
  studentId: string;
  firstName: string;
  hasPlan: boolean;
  instrument: string;
}) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ name: "idle" });
  const [withVideo, setWithVideo] = useState(false);
  const [camera, setCamera] = useState<"user" | "environment">("user");
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(-100);
  const [stoppedEarly, setStoppedEarly] = useState(false);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const tickRef = useRef<number | null>(null);
  const activityRef = useRef<ActivitySecond[]>([]);
  const startRef = useRef<{ wall: Date; perf: number } | null>(null);
  const wakeRef = useRef<WakeLockSentinel | null>(null);
  const previewRef = useRef<HTMLVideoElement>(null);
  const stoppingRef = useRef(false);
  const stopFlushRef = useRef<(() => void) | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

  // Tuner.
  const tuneNotes = useMemo(() => tuneNotesFor(instrument), [instrument]);
  const [tuner, setTunerState] = useState<TunerAudio | null>(null);
  const tunerRef = useRef<TunerAudio | null>(null);
  const setTuner = (t: TunerAudio | null) => {
    tunerRef.current = t;
    setTunerState(t);
  };
  const [tunerError, setTunerError] = useState<string | null>(null);
  const [readings, setReadings] = useState<TunerReadings>({});
  const [checks, setChecks] = useState<StoredCheck[]>([]);
  const checksRef = useRef<StoredCheck[]>([]);
  const readingsRef = useRef<TunerReadings>({});

  // Checks from earlier on this device (a page reload, or tuned then came back).
  useEffect(() => {
    const stored = loadChecks(studentId);
    checksRef.current = stored;
    const latest = stored[stored.length - 1];
    readingsRef.current = latest?.s ?? {};
    // Reading browser storage has to wait until after the first render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setChecks(stored);
    setReadings(readingsRef.current);
  }, [studentId]);

  const onReading = useCallback((name: string, cents: number) => {
    if (readingsRef.current[name] === cents) return;
    readingsRef.current = { ...readingsRef.current, [name]: cents };
    setReadings(readingsRef.current);
  }, []);

  const recording = phase.name === "recording";
  const busy = recording || phase.name === "uploading" || phase.name === "starting";

  // Keep the screen on while recording or uploading, and warn before leaving.
  useEffect(() => {
    if (!busy) return;
    const lock = () =>
      navigator.wakeLock
        ?.request("screen")
        .then((l) => (wakeRef.current = l))
        .catch(() => {});
    lock();
    const onVisible = () => {
      if (document.visibilityState === "visible") lock();
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("beforeunload", onBeforeUnload);
      wakeRef.current?.release().catch(() => {});
      wakeRef.current = null;
    };
  }, [busy]);

  // Release the microphone/camera (and the tuner's) if the page goes away.
  // teardown only reads refs, so the first render's copy is enough.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => () => teardown(), []);

  // Poll the review until it's done.
  useEffect(() => {
    if (phase.name !== "reviewing") return;
    let stop = false;
    const id = phase.sessionId;
    async function poll() {
      while (!stop) {
        await new Promise((r) => setTimeout(r, 5000));
        if (stop) return;
        const res = await fetch(`/api/practice/${id}`, { method: "POST" }).catch(() => null);
        const body = (await res?.json().catch(() => null)) as { status?: string; counted?: boolean | null; error?: string } | null;
        if (!body) continue;
        if (body.status === "done") {
          setPhase({ name: "done", counted: body.counted ?? null });
          router.refresh();
          return;
        }
        if (body.status === "error") {
          setPhase({ name: "error", message: body.error || "The review didn't finish." });
          router.refresh();
          return;
        }
      }
    }
    poll();
    return () => {
      stop = true;
    };
  }, [phase, router]);

  function teardown() {
    closeTuner();
    sourceRef.current = null;
    if (tickRef.current) window.clearInterval(tickRef.current);
    tickRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
  }

  async function openTuner() {
    setTunerError(null);
    const ctx = audioCtxRef.current;
    const source = sourceRef.current;
    if (recording && ctx && source) {
      // Listen through the recording's microphone.
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 4096;
      source.connect(analyser);
      setTuner({ ctx, analyser, own: null });
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setTunerError("This browser can't use the microphone. Try Safari on an iPhone or iPad, or Chrome on Android.");
      return;
    }
    // Made inside the tap, for iPhone and iPad.
    const own = new AudioContext();
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
    } catch {
      own.close().catch(() => {});
      setTunerError("The microphone wasn't allowed. Allow it for this site in the browser settings, then try again.");
      return;
    }
    await own.resume().catch(() => {});
    const analyser = own.createAnalyser();
    analyser.fftSize = 4096;
    own.createMediaStreamSource(stream).connect(analyser);
    setTuner({ ctx: own, analyser, own: stream });
  }

  /** Closes the tuner and keeps what it read as a tuning check. */
  function closeTuner() {
    const t = tunerRef.current;
    if (!t) return;
    if (t.own) {
      t.own.getTracks().forEach((tr) => tr.stop());
      t.ctx.close().catch(() => {});
    } else {
      try {
        t.analyser.disconnect();
      } catch {}
    }
    setTuner(null);
    const s = readingsRef.current;
    if (!tuneNotes || !Object.keys(s).length) return;
    const ok = tuneNotes.every((n) => s[n.name] !== undefined && Math.abs(s[n.name]) <= TUNED_CENTS);
    const last = checksRef.current[checksRef.current.length - 1];
    if (last && JSON.stringify(last.s) === JSON.stringify(s) && Date.now() - last.wall < 5000) return;
    checksRef.current = [...checksRef.current, { wall: Date.now(), s: { ...s }, ok }].slice(-10);
    setChecks(checksRef.current);
    saveChecks(studentId, checksRef.current);
  }

  async function start() {
    setStoppedEarly(false);
    if (tuner) closeTuner();
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setPhase({ name: "error", message: "This browser can't record. Try Safari on an iPhone or iPad, or Chrome on Android." });
      return;
    }
    setPhase({ name: "starting" });
    // The AudioContext must be made inside the tap on iPhone and iPad.
    const ctx = new AudioContext();
    audioCtxRef.current = ctx;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        // Phone voice processing treats instruments as noise; turn it off.
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        video: withVideo ? { facingMode: camera, width: { ideal: 1280 }, height: { ideal: 720 } } : false,
      });
    } catch {
      teardown();
      setPhase({
        name: "error",
        message: withVideo
          ? "The camera or microphone wasn't allowed. Allow them for this site in the browser settings, then try again."
          : "The microphone wasn't allowed. Allow it for this site in the browser settings, then try again.",
      });
      return;
    }
    streamRef.current = stream;
    if (withVideo && previewRef.current) {
      previewRef.current.srcObject = stream;
      previewRef.current.play().catch(() => {});
    }

    const type = pickType(withVideo);
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, {
        ...(type ? { mimeType: type } : {}),
        audioBitsPerSecond: 96_000,
        ...(withVideo ? { videoBitsPerSecond: 1_500_000 } : {}),
      });
    } catch {
      teardown();
      setPhase({ name: "error", message: "This browser can't record here. Try Safari on an iPhone or iPad, or Chrome." });
      return;
    }
    chunksRef.current = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => void finish(recorder.mimeType || type);
    recorderRef.current = recorder;

    // If the phone locks or another app takes the microphone, the track ends:
    // save what was recorded.
    for (const track of stream.getTracks()) {
      track.onended = () => {
        if (recorderRef.current?.state === "recording") {
          setStoppedEarly(true);
          stop();
        }
      };
    }

    // The sound timeline: level and notes, ten looks a second.
    await ctx.resume().catch(() => {});
    const source = ctx.createMediaStreamSource(stream);
    sourceRef.current = source;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);
    const buf = new Float32Array(analyser.fftSize);
    activityRef.current = [];
    let current: { t: number; db: number; notes: string[]; cents: number[]; fine: number[] } | null = null;
    const push = () => {
      if (!current) return;
      const c = current.cents.length
        ? current.cents.reduce((s, v) => s + Math.abs(v), 0) / current.cents.length
        : undefined;
      activityRef.current.push({
        t: current.t,
        db: Math.round(current.db),
        n: current.notes,
        ...(c !== undefined ? { c: Math.round(c) } : {}),
        ...(current.fine.some((v) => v > 0) ? { p: current.fine } : {}),
      });
    };

    startRef.current = { wall: new Date(), perf: performance.now() };
    recorder.start(1000);
    stoppingRef.current = false;
    setElapsed(0);
    setPhase({ name: "recording" });

    tickRef.current = window.setInterval(() => {
      const t0 = startRef.current;
      if (!t0) return;
      const secs = (performance.now() - t0.perf) / 1000;
      const sec = Math.floor(secs);
      if (!current || current.t !== sec) {
        push();
        current = { t: sec, db: -100, notes: [], cents: [], fine: [] };
      }
      analyser.getFloatTimeDomainData(buf);
      const db = levelDb(buf);
      current.db = Math.max(current.db, db);
      let reading = 0;
      if (db > QUIET_DB) {
        const p = detectPitch(buf, ctx.sampleRate);
        if (p) {
          if (current.notes[current.notes.length - 1] !== p.note && current.notes.length < 20) current.notes.push(p.note);
          current.cents.push(p.cents);
          reading = Math.round(p.midi * 100);
        }
      }
      if (current.fine.length < 30) current.fine.push(reading);
      setLevel(db);
      setElapsed(secs);
      if (secs >= MAX_SECONDS) stop();
    }, TICK_MS);
    // Flush the last partial second on stop.
    stopFlushRef.current = push;
  }

  function stop() {
    if (stoppingRef.current) return;
    stoppingRef.current = true;
    if (tickRef.current) window.clearInterval(tickRef.current);
    tickRef.current = null;
    stopFlushRef.current?.();
    stopFlushRef.current = null;
    const rec = recorderRef.current;
    if (rec && rec.state !== "inactive") rec.stop();
    else void finish(rec?.mimeType ?? "");
  }

  async function finish(mimeType: string) {
    const t0 = startRef.current;
    const ended = new Date();
    const duration = t0 ? (ended.getTime() - t0.wall.getTime()) / 1000 : 0;
    teardown();
    if (previewRef.current) previewRef.current.srcObject = null;
    const blob = new Blob(chunksRef.current, { type: mimeType || "audio/webm" });
    chunksRef.current = [];
    if (!t0) {
      setPhase({ name: "error", message: "Nothing was recorded. Try again." });
      return;
    }
    const input = {
      studentId,
      media: (withVideo ? "video" : "audio") as "audio" | "video",
      mimeType: blob.type,
      extension: extensionOf(blob.type),
      sizeBytes: blob.size,
      startedAt: t0.wall.toISOString(),
      endedAt: ended.toISOString(),
      durationSeconds: duration,
      practiceDate: toISODate(t0.wall),
      activity: activityRef.current,
      tuning: checksRef.current
        .map((c): TuningCheck => ({ t: Math.round((c.wall - t0.wall.getTime()) / 1000), s: c.s, ok: c.ok }))
        .filter((c) => c.t >= -TUNING_VALID_SECONDS),
    };
    await upload(blob, input);
  }

  async function upload(
    blob: Blob,
    input: Parameters<typeof createPracticeSession>[0],
    existing?: { id: string; path: string },
  ) {
    setPhase({ name: "uploading", progress: 0 });
    let created = existing;
    if (!created) {
      const made = await createPracticeSession(input).catch(() => ({ error: "Couldn't reach the server." }));
      if ("error" in made) {
        setPhase({ name: "error", message: made.error, retry: () => void upload(blob, input) });
        return;
      }
      created = made;
    }
    const session = created;
    const supabase = createClient();
    let failStatus: number | undefined;
    const ok =
      blob.size > 0 &&
      (await new Promise<boolean>((resolve) => {
        const up = new tus.Upload(blob, {
          endpoint: resumableEndpoint(),
          retryDelays: [0, 2000, 5000, 10000, 20000, 30000, 60000],
          chunkSize: CHUNK_SIZE,
          uploadDataDuringCreation: true,
          removeFingerprintOnSuccess: true,
          headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, "x-upsert": "true" },
          metadata: {
            bucketName: PRACTICE_BUCKET,
            objectName: session.path,
            contentType: blob.type.split(";")[0] || "application/octet-stream",
            cacheControl: "3600",
          },
          onBeforeRequest: async (req) => {
            const { data } = await supabase.auth.getSession();
            if (data.session) req.setHeader("authorization", `Bearer ${data.session.access_token}`);
          },
          onProgress: (sent, total) => setPhase({ name: "uploading", progress: total ? sent / total : 0 }),
          onError: (err) => {
            failStatus = (err as tus.DetailedError).originalResponse?.getStatus();
            resolve(false);
          },
          onSuccess: () => resolve(true),
        });
        up.start();
      }));

    if (!ok) {
      // The practice still happened: log it for the day and send it to the
      // teacher, reviewed from the sound timeline, marked "no recording".
      if (!existing) await finishPracticeUpload(session.id, true).catch(() => null);
      const why =
        blob.size === 0
          ? "the phone didn't capture any audio"
          : failStatus === 401 || failStatus === 403
            ? "storage refused the file"
            : failStatus === 413
              ? "the file is larger than the storage limit"
              : "the connection dropped";
      setPhase({
        name: "error",
        message:
          `Practice logged and sent to the teacher, but the recording didn't upload (${why}), so it's marked "no recording".` +
          (blob.size > 0 ? " Press Try again to add it; the recording is still on this page." : ""),
        retry: blob.size > 0 ? () => void upload(blob, input, session) : undefined,
      });
      router.refresh();
      return;
    }
    const finished = await (existing
      ? attachPracticeRecording(session.id, session.path)
      : finishPracticeUpload(session.id)
    ).catch(() => null);
    if (!finished) {
      setPhase({ name: "error", message: "Couldn't start the review. It will try again when this page is opened." });
      router.refresh();
      return;
    }
    if (finished.status === "done") {
      setPhase({ name: "done", counted: finished.counted });
      router.refresh();
    } else if (finished.status === "error") {
      setPhase({ name: "error", message: finished.error || "The review didn't finish." });
      router.refresh();
    } else {
      setPhase({ name: "reviewing", sessionId: session.id });
      router.refresh();
    }
  }

  const meter = Math.max(0, Math.min(1, (level + 60) / 55));
  const lastTuned = [...checks].reverse().find((c) => c.ok);
  const lastCheck = checks[checks.length - 1];
  const tunedAt = (c: StoredCheck) => new Date(c.wall).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

  const tunerView = tuner && tuneNotes && (
    <Tuner
      ctx={tuner.ctx}
      analyser={tuner.analyser}
      notes={tuneNotes}
      readings={readings}
      onReading={onReading}
      onDone={closeTuner}
      doneLabel={recording ? "Back to practice" : "Done tuning"}
    />
  );

  return (
    <Card tone="plum" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <div className="font-semibold">Practice session</div>
        {recording && <div className="font-mono text-2xl tabular-nums">{clock(elapsed)}</div>}
      </div>

      {withVideo && (
        <video
          ref={previewRef}
          muted
          playsInline
          className={cx("aspect-video w-full rounded-xl bg-black object-cover", !recording && phase.name !== "starting" && "hidden")}
        />
      )}

      {(phase.name === "idle" || phase.name === "done" || phase.name === "error") && (
        <>
          {phase.name === "done" && (
            <div className="text-sm">
              {phase.counted === false
                ? "Saved. This one didn't have enough playing to count; the review is below."
                : `All done. ${hasPlan ? "What we heard is ticked off below." : "The review is below."}`}
            </div>
          )}
          {phase.name === "error" && (
            <div className="flex flex-col gap-2 text-sm text-danger">
              {phase.message}
              {phase.retry && (
                <Button type="button" variant="secondary" onClick={phase.retry}>
                  Try again
                </Button>
              )}
            </div>
          )}
          {tuneNotes &&
            (tunerView ?? (
              <div
                className={cx(
                  "flex flex-col gap-2 rounded-2xl border px-4 py-3",
                  lastTuned ? "border-sage/40 bg-sage-soft" : "border-plum/30 bg-sheet",
                )}
              >
                {lastTuned ? (
                  <div className="text-lg font-semibold text-sage">✓ Tuned to A = 440 at {tunedAt(lastTuned)}</div>
                ) : (
                  <>
                    <div className="text-lg font-semibold">First, tune to A = 440</div>
                    <p className="text-[15px] text-muted">
                      {lastCheck
                        ? `${tuneNotes.length > 1 ? "Not every string was" : "The A wasn't"} in tune at ${tunedAt(lastCheck)}. `
                        : ""}
                      Tuning first means the review hears true pitch.{" "}
                      {tuneNotes.length > 1
                        ? "You can skip it; the review then works out the tuning from the open strings."
                        : "You can skip it."}
                    </p>
                  </>
                )}
                {tunerError && <div className="text-sm text-danger">{tunerError}</div>}
                <Button
                  type="button"
                  variant={lastTuned ? "secondary" : "plum"}
                  className="min-h-12 text-lg"
                  onClick={() => void openTuner()}
                >
                  {lastTuned ? "Tune again" : "Open the tuner"}
                </Button>
              </div>
            ))}
          {phase.name === "idle" && (
            <p className="text-sm text-muted">
              Set the phone or iPad near {firstName}, press Start, and practise as usual. When you stop, we listen back,
              tick off what was practised and keep a short review. The recording itself is deleted afterwards.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[16px]">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={withVideo}
                onChange={(e) => setWithVideo(e.target.checked)}
                className="h-5 w-5 accent-[var(--plum)]"
              />
              Record video too
            </label>
            {withVideo && (
              <label className="flex items-center gap-2 text-sm">
                Camera
                <select
                  value={camera}
                  onChange={(e) => setCamera(e.target.value as "user" | "environment")}
                  className="rounded-lg border border-rule bg-sheet px-2 py-1"
                >
                  <option value="user">Front</option>
                  <option value="environment">Back</option>
                </select>
              </label>
            )}
          </div>
          {withVideo && (
            <p className="text-xs text-muted">
              Piano: camera on a tripod looking down over the keys. Strings: camera facing the player from the front or
              side, whole body and bow in view.
            </p>
          )}
          <Button type="button" variant="plum" className="min-h-14 text-lg" onClick={start}>
            Start practice
          </Button>
        </>
      )}

      {phase.name === "starting" && <div className="text-sm text-muted">Getting the microphone ready…</div>}

      {recording && (
        <>
          {tunerView}
          {tuneNotes && !tuner && (
            <Button type="button" variant="secondary" className="min-h-12 text-lg" onClick={() => void openTuner()}>
              Tuner
            </Button>
          )}
          <div className="h-2 overflow-hidden rounded-full bg-plum/15" aria-hidden>
            <div className="h-full rounded-full bg-plum transition-[width] duration-100" style={{ width: `${meter * 100}%` }} />
          </div>
          <p className="text-xs text-muted">
            Keep this page open and the screen on. On iPhone and iPad, locking the screen or switching apps stops the
            recording (what was recorded so far is kept).
          </p>
          <Button type="button" variant="danger" className="min-h-14 bg-danger text-lg text-white hover:bg-danger" onClick={stop}>
            Stop practice
          </Button>
        </>
      )}

      {phase.name === "uploading" && (
        <div className="flex flex-col gap-2 text-sm">
          {stoppedEarly && <div>The recording stopped when the screen locked or another app opened. Saving what we have.</div>}
          <div>Sending the recording… {Math.round(phase.progress * 100)}%</div>
          <div className="h-2 overflow-hidden rounded-full bg-plum/15">
            <div className="h-full rounded-full bg-plum" style={{ width: `${phase.progress * 100}%` }} />
          </div>
        </div>
      )}

      {phase.name === "reviewing" && (
        <div className="text-sm">
          Listening back to the practice… This takes a minute or two. You can leave this page; the review will be waiting.
        </div>
      )}
    </Card>
  );
}
