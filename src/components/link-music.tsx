"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Matches the Lesson review clips to the student's sheet music with Claude.
 * Runs by itself once when a lesson has AI clips and music but no links yet;
 * "Match again" re-runs it.
 */
export function LinkMusic({ lessonId, linked, autoStart }: { lessonId: string; linked: boolean; autoStart: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  const run = useCallback(
    async (force: boolean) => {
      setBusy(true);
      setError(null);
      try {
        const res = await fetch(`/api/lessons/${lessonId}/music-links`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ force }),
        });
        const out = (await res.json().catch(() => null)) as {
          status?: string;
          error?: string;
        } | null;
        if (!res.ok || !out) setError("Matching the clips to the music didn't work. Try again.");
        else if (out.status !== "done") setError(out.error || "Nothing to match yet.");
        else router.refresh();
      } catch {
        setError("Matching the clips to the music didn't work. Try again.");
      } finally {
        setBusy(false);
      }
    },
    [lessonId, router],
  );

  useEffect(() => {
    if (!autoStart || started.current) return;
    started.current = true;
    void run(false);
  }, [autoStart, run]);

  if (busy)
    return (
      <span className="text-xs text-muted" role="status">
        ♪ Finding each clip in the sheet music…
      </span>
    );
  return (
    <span className="flex items-center gap-2 text-xs">
      {error && <span className="text-danger">{error}</span>}
      <button type="button" onClick={() => void run(linked)} className="font-medium text-accent-ink underline">
        {linked ? "Match music again" : "Match clips to the music"}
      </button>
    </span>
  );
}
