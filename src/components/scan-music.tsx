"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { SCORES_BUCKET } from "@/lib/constants";
import { digitizePage, loadForDigitize } from "@/lib/digitize-page";
import { saveScan, type ScanChange } from "@/app/students/music-actions";
import { cx } from "@/components/ui";

/** A page to digitize: its number, and a link to the photo it is made from. */
export type ScanSource = { n: number; url: string | null; path: string };

const pause = () => new Promise((r) => setTimeout(r, 0));

/**
 * Digitizes pages in this browser (the photos are downloaded, cleaned and
 * uploaded again), then saves them on the score.
 */
export async function digitizePages(
  scoreId: string,
  pages: ScanSource[],
  onStatus: (s: string) => void,
  opts: { wholePhoto?: boolean } = {},
): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClient();
  const stamp = Date.now().toString(36);
  const changes: ScanChange[] = [];
  for (const [i, p] of pages.entries()) {
    onStatus(`Digitizing page ${p.n}${pages.length > 1 ? ` (${i + 1} of ${pages.length})` : ""}…`);
    await pause();
    if (!p.url) return { ok: false, error: `Page ${p.n}'s picture couldn't be loaded. Reload and try again.` };
    let blob: Blob;
    try {
      const res = await fetch(p.url);
      if (!res.ok) throw new Error();
      blob = await res.blob();
    } catch {
      return { ok: false, error: "Couldn't load the pictures. Check the connection and try again." };
    }
    const img = await loadForDigitize(blob);
    const out = await digitizePage(img.source, img.w, img.h, opts);
    const folder = p.path.slice(0, p.path.lastIndexOf("/") + 1);
    const path = `${folder}scan-${stamp}-${String(p.n).padStart(3, "0")}.jpg`;
    const { error } = await supabase.storage
      .from(SCORES_BUCKET)
      .upload(path, out.blob, { contentType: "image/jpeg", upsert: true });
    if (error) return { ok: false, error: "Upload stopped. Check the connection and try again." };
    changes.push({ page: p.n, path, w: out.w, h: out.h, fit: out.fit, whole: !out.cropped });
  }
  onStatus("Saving the digitized pages…");
  return saveScan(scoreId, changes);
}

/** "Scan" / "Redigitize": digitizes the given pages of a score. */
export function ScanButton({
  scoreId,
  pages,
  label,
  busyLabel = "Digitizing…",
  wholePhoto,
  className,
}: {
  scoreId: string;
  pages: ScanSource[];
  label: string;
  busyLabel?: string;
  wholePhoto?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const res = await digitizePages(scoreId, pages, setStatus, { wholePhoto });
      if (!res.ok) setError(res.error ?? "Digitizing didn't work. Try again.");
    } catch {
      setError("Digitizing didn't work on this device. Try again, or on another device.");
    } finally {
      setStatus(null);
      setBusy(false);
      router.refresh();
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={run}
        disabled={busy || pages.length === 0}
        className={cx("text-accent-ink underline disabled:opacity-60", className)}
      >
        {busy ? busyLabel : label}
      </button>
      {(status || error) && (
        <span className={cx("basis-full text-sm", error ? "text-danger" : "text-muted")}>{error ?? status}</span>
      )}
    </>
  );
}
