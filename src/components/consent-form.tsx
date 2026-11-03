"use client";

import { useEffect, useRef, useState } from "react";
import { signConsent } from "@/app/students/consent-actions";
import { Button, Field, Input, Select } from "@/components/ui";
import { CONSENT_RELATIONSHIPS, CONSENT_VERSION } from "@/lib/recording-consent";

// The form the teacher hands to the parent on the iPad or phone: tick the box,
// type their name, sign with a finger, Sign.
export function ConsentForm({ studentId, next }: { studentId: string; next: string }) {
  const [agreed, setAgreed] = useState(false);
  const [name, setName] = useState("");
  const [signature, setSignature] = useState("");
  const ready = agreed && name.trim().length >= 2 && !!signature;

  return (
    <form action={signConsent} className="flex flex-col gap-4">
      <input type="hidden" name="student_id" value={studentId} />
      <input type="hidden" name="next" value={next} />
      <input type="hidden" name="version" value={CONSENT_VERSION} />
      <input type="hidden" name="signature" value={signature} />

      <label className="flex items-start gap-3 rounded-xl border border-rule bg-paper px-3 py-3 text-[16px]">
        <input
          type="checkbox"
          name="agree"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="mt-1 size-5 shrink-0 accent-[var(--accent)]"
        />
        <span>I am this student&apos;s parent or legal guardian, I have read the points above, and I agree to them.</span>
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Your full name">
          <Input
            name="signer_name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            required
          />
        </Field>
        <Field label="You are the student's">
          <Select name="relationship" defaultValue="parent">
            {CONSENT_RELATIONSHIPS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Your email (optional, for a copy later)">
        <Input name="signer_email" type="email" autoComplete="email" />
      </Field>

      <SignaturePad onChange={setSignature} />

      <Button disabled={!ready} className="min-h-12 w-full text-lg">
        Sign
      </Button>
      {!ready && (
        <p className="-mt-2 text-center text-sm text-muted">Tick the box, type your name and sign above to continue.</p>
      )}
    </form>
  );
}

/** A box to sign in with a finger, stylus or mouse. Reports a PNG, or "" when empty. */
function SignaturePad({ onChange }: { onChange: (png: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [empty, setEmpty] = useState(true);

  // Match the canvas to its on-screen size (sharp on Retina screens).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const { width, height } = canvas.getBoundingClientRect();
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = "#2b2521";
  }, []);

  function point(e: React.PointerEvent<HTMLCanvasElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function down(e: React.PointerEvent<HTMLCanvasElement>) {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    last.current = point(e);
    const ctx = e.currentTarget.getContext("2d");
    if (ctx && last.current) {
      ctx.beginPath();
      ctx.arc(last.current.x, last.current.y, 1.2, 0, Math.PI * 2);
      ctx.fillStyle = "#2b2521";
      ctx.fill();
    }
  }

  function move(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current || !last.current) return;
    e.preventDefault();
    const p = point(e);
    const ctx = e.currentTarget.getContext("2d");
    if (!ctx) return;
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
  }

  function up(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    drawing.current = false;
    last.current = null;
    setEmpty(false);
    onChange(e.currentTarget.toDataURL("image/png"));
  }

  function clear() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    setEmpty(true);
    onChange("");
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-medium text-muted">Sign here</span>
        {!empty && (
          <button type="button" onClick={clear} className="text-sm text-accent-ink underline">
            Clear
          </button>
        )}
      </div>
      <div className="relative">
        <canvas
          ref={canvasRef}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          className="block h-40 w-full touch-none rounded-xl border border-rule bg-white"
          aria-label="Signature box"
        />
        {empty && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-muted/70">
            Sign with your finger
          </span>
        )}
        <span className="pointer-events-none absolute right-4 bottom-8 left-4 border-b border-dashed border-rule" />
      </div>
    </div>
  );
}
