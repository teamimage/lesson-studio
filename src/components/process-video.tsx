"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Notice, Select } from "@/components/ui";
import { formatBytes } from "@/lib/format";
import type { ProcessState } from "@/lib/ai/process-lesson";

type Rec = { id: string; name: string; sizeBytes: number; durationSeconds: number | null };

const POLL_MS = 10_000;

/**
 * "Process video": transcribes the lesson video and has Claude draft the
 * lesson record. Polls the server while the transcription runs; the request
 * that finds the transcript ready also runs the Claude draft.
 */
export function ProcessVideo({
  lessonId,
  recordings,
  initial,
  isDraft,
}: {
  lessonId: string;
  recordings: Rec[];
  initial: ProcessState;
  isDraft: boolean;
}) {
  const router = useRouter();
  const [state, setState] = useState<ProcessState>(initial);
  const [busy, setBusy] = useState(false);
  const [recordingId, setRecordingId] = useState(initial.recordingId ?? recordings[0]?.id ?? "");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [now, setNow] = useState(0); // 0 until mounted, so server and browser render the same

  const call = useCallback(
    async (body: Record<string, string>) => {
      const res = await fetch(`/api/lessons/${lessonId}/process`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`The server said ${res.status}.`);
      return (await res.json()) as ProcessState;
    },
    [lessonId],
  );

  const running = state.status === "transcribing" || state.status === "drafting";

  // Poll one request at a time while a job is running.
  useEffect(() => {
    if (!running) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const next = await call({ action: "check" });
        if (cancelled) return;
        setState(next);
        if (next.status === "done") router.refresh();
        if (next.status === "transcribing" || next.status === "drafting") timer.current = setTimeout(tick, POLL_MS);
      } catch {
        if (!cancelled) timer.current = setTimeout(tick, POLL_MS * 3);
      }
    };
    timer.current = setTimeout(tick, state.status === "drafting" ? 2_000 : POLL_MS);
    return () => {
      cancelled = true;
      if (timer.current) clearTimeout(timer.current);
    };
    // Restart only when the job starts or stops, not on every status tweak.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, call, router]);

  // Re-render every second so the bar and elapsed time move.
  useEffect(() => {
    if (!running && !busy) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running, busy]);

  const rec = recordings.find((r) => r.id === (state.recordingId ?? recordingId));
  const progress = progressFor(state, busy, now, rec?.durationSeconds ?? null);

  async function run(body: Record<string, string>) {
    setBusy(true);
    try {
      const next = await call(body);
      setState(next);
      if (next.status === "done") router.refresh();
    } catch (e) {
      setState({ status: "error", error: e instanceof Error ? e.message : "Something went wrong." });
    } finally {
      setBusy(false);
    }
  }

  if (recordings.length === 0) return null;

  return (
    <Card className="flex flex-col gap-3">
      <div>
        <div className="font-semibold">Process video with AI</div>
        <p className="text-sm text-muted">
          Transcribes what was said, then Claude drafts the summary, pieces and practice assignments for you to
          check and approve.
        </p>
      </div>

      {progress && <ProgressBar {...progress} />}
      {state.status === "transcribing" && (
        <p className="text-sm text-muted">
          You can leave this page and come back; it picks up where it left off when you return.
        </p>
      )}
      {state.status === "done" && (
        <Notice tone="sage">
          {state.applied
            ? "Draft written from the video. Read it over above, edit anything, then approve."
            : "Draft written, but this lesson is already approved, so nothing was changed. Move it back to draft and press Draft again to use it."}
        </Notice>
      )}
      {state.status === "error" && state.error && <Notice tone="danger">{state.error}</Notice>}

      {(state.status === "none" || (state.status === "error" && !state.recordingId)) && (
        <div className="flex flex-col gap-2 sm:flex-row">
          {recordings.length > 1 && (
            <Select value={recordingId} onChange={(e) => setRecordingId(e.target.value)} aria-label="Which video">
              {recordings.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} ({formatBytes(r.sizeBytes)})
                </option>
              ))}
            </Select>
          )}
          <Button disabled={busy || !recordingId} onClick={() => run({ action: "start", recordingId })}>
            {busy ? "Starting…" : "Process video"}
          </Button>
        </div>
      )}

      {state.status === "error" && state.recordingId && (
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => run({ action: "start", recordingId: state.recordingId! })}
        >
          {busy ? "Working…" : "Try again"}
        </Button>
      )}

      {state.status === "done" && isDraft && (
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => {
            if (confirm("Draft again from the same transcript? This replaces the summary, notes, pieces and assignments.")) {
              void run({ action: "redraft" });
            }
          }}
        >
          {busy ? "Drafting…" : "Draft again"}
        </Button>
      )}
    </Card>
  );
}

type Progress = { label: string; step: string; fraction: number; elapsed: string };

function elapsedText(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * The services don't report percent done, so the bar is an estimate from
 * elapsed time: transcription takes roughly a fifth of the video's length
 * (at least a minute), drafting about a minute and a half. It never reaches
 * the end until the step really finishes.
 */
function progressFor(state: ProcessState, busy: boolean, now: number, durationSeconds: number | null): Progress | null {
  const since = state.since ? Date.parse(state.since) : now;
  const elapsedMs = Math.max(0, now - since);
  const ease = (ms: number, expectedMs: number) => Math.min(0.95, 1 - Math.exp(-ms / expectedMs));
  if (state.status === "transcribing") {
    const expected = Math.max(60, (durationSeconds ?? 3600) * 0.2) * 1000;
    return {
      step: "Step 1 of 2",
      label: "Transcribing what was said",
      fraction: 0.05 + 0.65 * ease(elapsedMs, expected),
      elapsed: elapsedText(elapsedMs),
    };
  }
  if (state.status === "drafting") {
    return {
      step: "Step 2 of 2",
      label: "Claude is writing the lesson draft",
      fraction: 0.7 + 0.3 * ease(elapsedMs, 90_000),
      elapsed: elapsedText(elapsedMs),
    };
  }
  if (busy) return { step: "Starting", label: "Sending the video to be transcribed", fraction: 0.03, elapsed: "" };
  return null;
}

function ProgressBar({ label, step, fraction, elapsed }: Progress) {
  return (
    <div className="flex flex-col gap-1.5" role="status" aria-live="polite">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span>
          <span className="font-medium">{label}</span>
          <span className="text-muted"> · {step}</span>
        </span>
        {elapsed && <span className="tabular-nums text-muted">{elapsed}</span>}
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-rule"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(fraction * 100)}
      >
        <div
          className="h-full rounded-full bg-plum transition-[width] duration-1000 ease-linear"
          style={{ width: `${Math.round(fraction * 100)}%` }}
        />
      </div>
    </div>
  );
}
