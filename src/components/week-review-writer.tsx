"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "./ui";

async function write(studentId: string, weekStart: string): Promise<string | null> {
  for (let i = 0; i < 40; i++) {
    const out = await once(studentId, weekStart);
    if (out !== "busy") return out;
    // Another page is writing it; wait and ask again.
    await new Promise((r) => setTimeout(r, 8000));
  }
  return "The review is taking a long time. Try again.";
}

async function once(studentId: string, weekStart: string): Promise<string | null> {
  const res = await fetch("/api/practice/week", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ studentId, weekStart }),
  }).catch(() => null);
  const body = (await res?.json().catch(() => null)) as { ok?: boolean; busy?: boolean; error?: string } | null;
  if (!body) return "Couldn't reach the server. Try again.";
  if (body.ok && body.busy) return "busy";
  return body.ok ? null : (body.error ?? "Something went wrong.");
}

/**
 * Writes a week's review. With `auto` it starts as soon as it is on screen
 * (finished weeks); otherwise it is a button (this week so far, or a retry).
 * `quiet` shows nothing unless it fails (used on the Home practice page).
 */
export function WeekReviewWriter({
  studentId,
  weekStart,
  auto = false,
  quiet = false,
  label = "Write the review",
}: {
  studentId: string;
  weekStart: string;
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
    const err = await write(studentId, weekStart);
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
        <span className="text-muted">Writing the weekly review… this takes about half a minute.</span>
      ) : (
        <Button type="button" variant="secondary" className="min-h-9 px-3 text-sm" onClick={run}>
          {error ? "Try again" : label}
        </Button>
      )}
      {error && !busy && <span className="text-danger">{error}</span>}
    </div>
  );
}
