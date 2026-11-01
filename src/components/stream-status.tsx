"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Progress = {
  status: "off" | "waiting" | "pending" | "ready" | "error";
  percent: number | null;
  error: string | null;
};

const POLL_MS = 15_000;

/**
 * Shows the teacher how the fast streaming copy is coming along. Starts it
 * if it hasn't been started (videos uploaded before streaming was set up),
 * checks every 15 seconds while Cloudflare prepares it, and reloads the
 * page's data when it's ready so the players switch over.
 */
export function StreamStatus({
  recordingId,
  initialStatus,
  initialError,
}: {
  recordingId: string;
  initialStatus: string | null;
  initialError: string | null;
}) {
  const router = useRouter();
  const [p, setP] = useState<Progress>({
    status: initialStatus === "error" ? "error" : "pending",
    percent: null,
    error: initialError,
  });
  const [retrying, setRetrying] = useState(false);

  async function check(retry = false) {
    try {
      const res = await fetch(`/api/recordings/${recordingId}/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ retry }),
      });
      const next = (await res.json()) as Progress;
      setP(next);
      if (next.status === "ready") router.refresh();
      return next;
    } catch {
      return null;
    }
  }

  useEffect(() => {
    if (p.status !== "pending") return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      const next = await check();
      if (!stop && (!next || next.status === "pending")) timer = setTimeout(tick, POLL_MS);
    };
    // Check straight away the first time, then every 15 seconds.
    timer = setTimeout(tick, initialStatus === "pending" ? POLL_MS : 0);
    return () => {
      stop = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.status, recordingId]);

  if (p.status === "pending") {
    return (
      <p className="flex items-center gap-2 text-sm text-muted">
        <span className="inline-block size-2 animate-pulse rounded-full bg-amber" aria-hidden />
        Preparing a fast streaming copy{p.percent ? ` (${p.percent}%)` : ""}. Usually a few minutes; the original
        plays until then.
      </p>
    );
  }
  if (p.status === "error") {
    return (
      <p className="text-sm text-muted">
        Couldn&apos;t make the fast streaming copy{p.error ? `: ${p.error}` : "."} The original still plays.{" "}
        <button
          disabled={retrying}
          onClick={async () => {
            setRetrying(true);
            await check(true);
            setRetrying(false);
          }}
          className="font-medium text-accent-ink underline disabled:opacity-50"
        >
          {retrying ? "Starting…" : "Try again"}
        </button>
      </p>
    );
  }
  return null;
}
