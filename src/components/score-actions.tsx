"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { deleteScore } from "@/app/students/music-actions";
import { readMusic } from "@/components/score-uploader";

/** Asks Claude to read (or re-read) a score, then refreshes the page. */
export function ReadMusicButton({ scoreId, label }: { scoreId: string; label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function run() {
    setBusy(true);
    setError(null);
    setTimeout(() => router.refresh(), 2500);
    const res = await readMusic(scoreId);
    if (res.status === "error") setError(res.error ?? "Reading the music didn't work.");
    setBusy(false);
    router.refresh();
  }
  return (
    <>
      <button type="button" onClick={run} disabled={busy} className="text-accent-ink underline disabled:opacity-60">
        {busy ? "Reading…" : label}
      </button>
      {error && <span className="basis-full text-sm text-danger">{error}</span>}
    </>
  );
}

/** Deletes the whole upload: original file, page images and the pieces found in it. */
export function DeleteScoreButton({
  scoreId,
  title,
  pages,
  pieces,
  hasOriginal,
}: {
  scoreId: string;
  title: string;
  pages: number;
  pieces: number;
  hasOriginal: boolean;
}) {
  const parts = [
    hasOriginal ? "the original file" : null,
    `${pages} page${pages === 1 ? "" : "s"}`,
    pieces ? `the ${pieces} piece${pieces === 1 ? "" : "s"} found in it` : null,
  ].filter(Boolean);
  return (
    <form
      action={deleteScore}
      onSubmit={(e) => {
        if (!confirm(`Delete "${title}"? This removes ${parts.join(", ")}. It can't be undone.`)) e.preventDefault();
      }}
    >
      <input type="hidden" name="score_id" value={scoreId} />
      <button className="text-danger underline">Delete</button>
    </form>
  );
}

/** Refreshes the page every few seconds while Claude is reading some music. */
export function RefreshWhileReading({ active }: { active: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(t);
  }, [active, router]);
  return null;
}
