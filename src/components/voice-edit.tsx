"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { saveLessonSection } from "@/app/lessons/actions";
import { Button, cx, textareaClass } from "@/components/ui";
import {
  MAX_DICTATION_SECONDS,
  SECTION_LABELS,
  type NoteSection,
  type SectionProposal,
} from "@/lib/note-sections";

const HOLD_MS = 500;
const MOVE_TOLERANCE = 10;

/**
 * Wraps one section of the lesson notes. Holding it (touch or mouse) for
 * half a second opens a panel where the teacher types or dictates what
 * should change; Claude rewrites the section and the teacher accepts the
 * new text before it is saved. A tap still works as before.
 */
export function VoiceEditSection({
  lessonId,
  section,
  current,
  children,
  className,
}: {
  lessonId: string;
  section: NoteSection;
  /** The section as it reads now, shown at the top of the panel. */
  current: string;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pressing, setPressing] = useState(false);
  const timer = useRef<number | null>(null);
  const startAt = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);

  const cancel = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    startAt.current = null;
    setPressing(false);
  };
  const openPanel = () => {
    cancel();
    fired.current = true;
    navigator.vibrate?.(15);
    setOpen(true);
  };
  useEffect(() => cancel, []);

  return (
    <>
      <div
        className={cx(
          "transition-colors duration-300 [-webkit-touch-callout:none] [@media(pointer:coarse)]:select-none",
          pressing && "bg-accent-soft/70",
          className,
        )}
        onPointerDown={(e) => {
          if (e.pointerType === "mouse" && e.button !== 0) return;
          fired.current = false;
          startAt.current = { x: e.clientX, y: e.clientY };
          setPressing(true);
          timer.current = window.setTimeout(openPanel, HOLD_MS);
        }}
        onPointerMove={(e) => {
          const s = startAt.current;
          if (s && Math.hypot(e.clientX - s.x, e.clientY - s.y) > MOVE_TOLERANCE) cancel();
        }}
        onPointerUp={cancel}
        onPointerLeave={cancel}
        onPointerCancel={cancel}
        // Android opens a context menu on a long press, and a right click
        // on a computer is a quick way in too.
        onContextMenu={(e) => {
          e.preventDefault();
          if (!open) openPanel();
        }}
        // The tap that ends a hold mustn't also open a row or a video.
        onClickCapture={(e) => {
          if (fired.current) {
            e.preventDefault();
            e.stopPropagation();
            fired.current = false;
          }
        }}
      >
        {children}
      </div>
      {open &&
        createPortal(
          <VoiceEditPanel lessonId={lessonId} section={section} current={current} onClose={() => setOpen(false)} />,
          document.body,
        )}
    </>
  );
}

type Step =
  | { name: "ask" }
  | { name: "recording"; seconds: number }
  | { name: "transcribing" }
  | { name: "thinking" }
  | { name: "review"; proposal: SectionProposal }
  | { name: "saving"; proposal: SectionProposal };

const AUDIO_TYPES = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];

function VoiceEditPanel({
  lessonId,
  section,
  current,
  onClose,
}: {
  lessonId: string;
  section: NoteSection;
  current: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const label = SECTION_LABELS[section];
  const [step, setStep] = useState<Step>({ name: "ask" });
  const [instruction, setInstruction] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const tick = useRef<number | null>(null);
  const discard = useRef(false);
  const canRecord =
    typeof window !== "undefined" && typeof MediaRecorder !== "undefined" && !!navigator.mediaDevices?.getUserMedia;

  // Stop the mic if the panel closes mid-recording.
  useEffect(
    () => () => {
      discard.current = true;
      if (tick.current !== null) window.clearInterval(tick.current);
      if (recorder.current?.state === "recording") recorder.current.stop();
    },
    [],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  async function startRecording() {
    setError(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch {
      setError("The microphone isn't available. Allow it in the browser settings, or type the change.");
      return;
    }
    const type = AUDIO_TYPES.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
    const rec = new MediaRecorder(stream, { ...(type ? { mimeType: type } : {}), audioBitsPerSecond: 64_000 });
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      if (tick.current !== null) window.clearInterval(tick.current);
      tick.current = null;
      if (discard.current) return;
      void transcribe(new Blob(chunks, { type: rec.mimeType || type || "audio/webm" }));
    };
    recorder.current = rec;
    discard.current = false;
    rec.start(1000);
    const began = Date.now();
    setStep({ name: "recording", seconds: 0 });
    tick.current = window.setInterval(() => {
      const seconds = Math.floor((Date.now() - began) / 1000);
      setStep({ name: "recording", seconds });
      if (seconds >= MAX_DICTATION_SECONDS) stopRecording();
    }, 250);
  }

  function stopRecording() {
    if (recorder.current?.state === "recording") recorder.current.stop();
  }

  function cancelRecording() {
    discard.current = true;
    stopRecording();
    setStep({ name: "ask" });
  }

  async function transcribe(blob: Blob) {
    setStep({ name: "transcribing" });
    try {
      const res = await fetch(`/api/lessons/${lessonId}/dictate`, {
        method: "POST",
        headers: { "content-type": blob.type || "application/octet-stream" },
        body: blob,
      });
      const body = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
      if (!res.ok || !body.text) throw new Error(body.error || "Couldn't hear that. Try again.");
      const text = body.text;
      setInstruction((prev) => (prev.trim() ? `${prev.trim()} ${text}` : text));
      setStep({ name: "ask" });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't hear that. Try again.");
      setStep({ name: "ask" });
    }
  }

  async function makeChange() {
    if (!instruction.trim()) {
      setError("Say or type what should change first.");
      return;
    }
    setError(null);
    setStep({ name: "thinking" });
    try {
      const res = await fetch(`/api/lessons/${lessonId}/revise`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ section, instruction }),
      });
      const body = (await res.json().catch(() => ({}))) as { proposal?: SectionProposal; error?: string };
      if (!res.ok || !body.proposal) throw new Error(body.error || "Claude couldn't make the change. Try again.");
      setStep({ name: "review", proposal: body.proposal });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Claude couldn't make the change. Try again.");
      setStep({ name: "ask" });
    }
  }

  async function accept(proposal: SectionProposal) {
    setError(null);
    setStep({ name: "saving", proposal });
    const out = await saveLessonSection(lessonId, proposal).catch(() => ({ error: "Couldn't save. Try again." }));
    if ("error" in out) {
      setError(out.error);
      setStep({ name: "review", proposal });
      return;
    }
    router.refresh();
    onClose();
  }

  const busy = step.name === "transcribing" || step.name === "thinking" || step.name === "saving";
  const reviewing = step.name === "review" || step.name === "saving";

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Change ${label}`}
    >
      <div className="flex max-h-[92dvh] w-full max-w-xl flex-col gap-3 overflow-y-auto rounded-t-2xl bg-paper p-4 text-ink shadow-2xl sm:rounded-2xl">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="text-[12px] font-semibold uppercase tracking-[0.1em] text-accent-ink">Change {label}</div>
            <p className="text-sm text-muted">
              {reviewing
                ? "Check the new version. Nothing is saved until you press Save."
                : "Say or type what should change. Claude rewrites this section for you to check."}
            </p>
          </div>
          <button onClick={onClose} className="min-h-9 rounded-lg px-3 text-lg leading-none text-muted" aria-label="Close">
            ✕
          </button>
        </div>

        {!reviewing && (
          <>
            <div className="max-h-40 overflow-y-auto whitespace-pre-line rounded-xl border border-rule bg-sheet px-3 py-2 text-sm text-muted">
              {current || "This section is empty."}
            </div>

            {step.name === "recording" ? (
              <div className="flex items-center gap-3 rounded-xl border border-danger/30 bg-danger-soft px-3 py-3">
                <span className="h-3 w-3 shrink-0 animate-pulse rounded-full bg-danger" aria-hidden />
                <span className="flex-1 text-sm font-medium tabular-nums">
                  Listening… {Math.floor(step.seconds / 60)}:{String(step.seconds % 60).padStart(2, "0")}
                </span>
                <button onClick={cancelRecording} className="text-sm text-muted underline">
                  Cancel
                </button>
                <Button variant="danger" onClick={stopRecording} className="min-h-10 bg-sheet">
                  ■ Stop
                </Button>
              </div>
            ) : (
              <textarea
                className={cx(textareaClass, "min-h-28")}
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                placeholder={`For example: "Say we worked on bow distribution in the last line, not the first."`}
                disabled={busy}
                autoFocus={!canRecord}
              />
            )}

            {error && <p className="text-sm text-danger">{error}</p>}

            <div className="flex flex-wrap items-center gap-2">
              {canRecord && step.name !== "recording" && (
                <Button variant="secondary" onClick={() => void startRecording()} disabled={busy}>
                  <span className="text-danger" aria-hidden>
                    ●
                  </span>
                  {instruction.trim() ? "Record more" : "Record"}
                </Button>
              )}
              <Button
                className="flex-1"
                onClick={() => void makeChange()}
                disabled={busy || step.name === "recording" || !instruction.trim()}
              >
                {step.name === "transcribing"
                  ? "Writing down what you said…"
                  : step.name === "thinking"
                    ? "Rewriting…"
                    : "Make the change"}
              </Button>
            </div>
          </>
        )}

        {reviewing && (
          <ReviewProposal
            proposal={step.proposal}
            disabled={step.name === "saving"}
            onEdit={(proposal) => setStep({ name: "review", proposal })}
          />
        )}
        {reviewing && error && <p className="text-sm text-danger">{error}</p>}
        {reviewing && (
          <div className="flex flex-wrap gap-2">
            <Button variant="sage" className="flex-1" onClick={() => void accept(step.proposal)} disabled={step.name === "saving"}>
              {step.name === "saving" ? "Saving…" : "Save"}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setError(null);
                setStep({ name: "ask" });
              }}
              disabled={step.name === "saving"}
            >
              Change it again
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function ReviewProposal({
  proposal,
  disabled,
  onEdit,
}: {
  proposal: SectionProposal;
  disabled: boolean;
  onEdit: (p: SectionProposal) => void;
}) {
  if (proposal.section === "pieces") {
    return proposal.pieces.length ? (
      <ul className="flex flex-col divide-y divide-rule rounded-xl border border-rule bg-sheet text-sm">
        {proposal.pieces.map((p, i) => (
          <li key={i} className="px-3 py-2">
            <span className="font-medium">{p.title}</span>{" "}
            <span className="text-muted">{p.activity.replace(/_/g, " ")}</span>
            {p.notes && <div className="text-muted">{p.notes}</div>}
          </li>
        ))}
      </ul>
    ) : (
      <p className="rounded-xl border border-rule bg-sheet px-3 py-2 text-sm text-muted">No pieces.</p>
    );
  }
  if (proposal.section === "assignments") {
    return proposal.assignments.length ? (
      <ol className="flex flex-col divide-y divide-rule rounded-xl border border-rule bg-sheet text-sm">
        {proposal.assignments.map((a, i) => (
          <li key={i} className="flex gap-2.5 px-3 py-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent-ink">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <div className="font-medium">
                {a.title}
                {!a.id && <span className="ml-1.5 text-xs font-semibold text-sage">new</span>}
              </div>
              {a.how && <div className="text-muted">{a.how}</div>}
            </div>
          </li>
        ))}
      </ol>
    ) : (
      <p className="rounded-xl border border-rule bg-sheet px-3 py-2 text-sm text-muted">No assignments.</p>
    );
  }
  return (
    <textarea
      className={cx(textareaClass, "min-h-40")}
      value={proposal.text}
      onChange={(e) => onEdit({ ...proposal, text: e.target.value })}
      disabled={disabled}
      aria-label="New version"
    />
  );
}
