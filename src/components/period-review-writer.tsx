"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "./ui";

async function write(studentId: string, start: string): Promise<string | null> {
  for (let i = 0; i < 40; i++) {
    const out = await once(studentId, start);
    if (out !== "busy") return out;
    // Another page is writing it; wait and ask again.
    await new Promise((r) => setTimeout(r, 8000));
  }
  return "The review is taking a long time. Try again.";
}

async function once(studentId: string, start: string): Promise<string | null> {
  const res = await fetch("/api/practice/period", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ studentId, start }),
  }).catch(() => null);
  const body = (await res?.json().catch(() => null)) as { ok?: boolean; busy?: boolean; error?: string } | null;
  if (!body) return "Couldn't reach the server. Try again.";
  if (body.ok && body.busy) return "busy";
  return body.ok ? null : (body.error ?? "Something went wrong.");
}

/**
 * Writes a lesson-to-lesson practice review. With `auto` it starts as soon as
 * it is on screen (finished periods); otherwise it is a button (the open
 * period so far, or a retry). `quiet` shows nothing at all (used on the Home
 * practice, student and lesson pages to write the period that just ended).
 */
export function PeriodReviewWriter({
  studentId,
  start,
  auto = false,
  quiet = false,
  label = "Write the review",
}: {
  studentId: string;
  start: string;
  auto?: boolean;
  quiet?: boolean;
  label?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(auto);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  async function run() {
    setBusy(true);
    setError(null);
    const err = await write(studentId, start);
    setBusy(false);
    if (err) setError(err);
    else router.refresh();
  }

  useEffect(() => {
    if (!auto || started.current) return;
    started.current = true;
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto]);

  if (quiet) return null;
  return (
    <div className="no-print flex flex-wrap items-center gap-3 text-sm">
      {busy ? (
        <span className="text-muted">Writing the practice review… this takes about half a minute.</span>
      ) : (
        <Button type="button" variant="secondary" className="min-h-9 px-3 text-sm" onClick={run}>
          {error ? "Try again" : label}
        </Button>
      )}
      {error && !busy && <span className="text-danger">{error}</span>}
    </div>
  );
}
