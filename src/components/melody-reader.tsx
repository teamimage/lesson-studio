"use client";

import { useEffect, useRef, useState } from "react";
import type { MelodyProgress } from "@/lib/ai/transcribe-melody";

// On the Music page: Claude writes out the notes of each piece once (a few
// pieces per call), so practice sessions can be matched against the
// student's own music. Runs by itself while the page is open; stops on an
// error and offers Try again.

export function MelodyReader({ scoreId, initial }: { scoreId: string; initial: MelodyProgress }) {
  const [p, setP] = useState<MelodyProgress>(initial);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(initial.error ?? null);
  const running = useRef(false);

  async function run(retry: boolean) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setFailed(null);
    let first = true;
    try {
      for (let i = 0; i < 40; i++) {
        const res = await fetch(`/api/scores/${scoreId}/melody${retry && first ? "?retry=1" : ""}`, { method: "POST" });
        first = false;
        if (!res.ok) throw new Error("Reading the notes stopped. Try again.");
        const next = (await res.json()) as MelodyProgress;
        setP(next);
        if (next.error) {
          setFailed(next.error);
          break;
        }
        if (next.done >= next.total) break;
      }
    } catch (e) {
      setFailed(e instanceof Error ? e.message : "Reading the notes stopped. Try again.");
    } finally {
      running.current = false;
      setBusy(false);
    }
  }

  useEffect(() => {
    if (initial.error || initial.done >= initial.total) return;
    // Start once when the page opens.
    const t = window.setTimeout(() => void run(false), 300);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!p.total) return null;
  const complete = p.done >= p.total;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
      {complete ? (
        <span>
          ♪ Notes read for {p.total - p.errors} of {p.total} piece{p.total === 1 ? "" : "s"}, so practice can be matched to
          this music.
        </span>
      ) : busy ? (
        <span>
          Reading the notes for practice matching… {p.done} of {p.total} piece{p.total === 1 ? "" : "s"}
        </span>
      ) : (
        <span>
          Notes read for {p.done} of {p.total} piece{p.total === 1 ? "" : "s"}.
        </span>
      )}
      {failed && <span className="basis-full text-danger">{failed}</span>}
      {!busy && (p.errors > 0 || (!complete && !failed) || (failed && !/sql/i.test(failed))) && (
        <button type="button" className="text-accent-ink underline" onClick={() => void run(p.errors > 0)}>
          {complete ? "Try the missing ones again" : failed ? "Try again" : "Continue"}
        </button>
      )}
    </div>
  );
}
