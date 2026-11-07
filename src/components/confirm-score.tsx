"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { confirmScore, deleteScore } from "@/app/students/music-actions";
import { ReadMusicButton } from "@/components/score-actions";
import { ScanButton, type ScanSource } from "@/components/scan-music";
import { Button, cx } from "@/components/ui";
import { pageRange, sectionLabel, type ScoreDetails, type ScoreSection } from "@/lib/score-analysis";

export type PendingScore = {
  id: string;
  title: string;
  pages: { n: number; url: string | null; w: number; h: number }[];
  scan: ScanSource[];
  status: "none" | "running" | "done" | "error";
  error: string | null;
  book: string;
  details: ScoreDetails;
  sections: ScoreSection[];
  viewer: string;
  hasOriginals: boolean;
};

const FIELDS: { key: keyof ScoreDetails; label: string; placeholder: string }[] = [
  { key: "composer", label: "Composer", placeholder: "e.g. Franz Gruber" },
  { key: "arranger", label: "Arranger", placeholder: "if arranged" },
  { key: "publisher", label: "Publisher", placeholder: "e.g. Alfred" },
  { key: "published", label: "Published", placeholder: "year or date" },
  { key: "tempo", label: "Tempo marking", placeholder: "e.g. Allegro ♩ = 108" },
];

/**
 * The check after an upload: the digitized pages and everything read from
 * them, to correct before the music goes into the music library.
 */
export function ConfirmScore({ score }: { score: PendingScore }) {
  const router = useRouter();
  const reading = score.status === "running" || score.status === "none";
  const [title, setTitle] = useState(score.title);
  const [details, setDetails] = useState<ScoreDetails>(score.details);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Fill the boxes once Claude's reading arrives (unless already typed in).
  const [seen, setSeen] = useState(score.status);
  if (seen !== score.status) {
    setSeen(score.status);
    if (score.status === "done") {
      setTitle((t) => (t === "" || t === score.title ? score.title : t));
      setDetails((d) => (Object.values(d).every((v) => !v) ? score.details : d));
    }
  }

  async function addToLibrary() {
    setBusy(true);
    setError(null);
    const res = await confirmScore(score.id, { title, details });
    setBusy(false);
    if (!res.ok) setError(res.error ?? "Couldn't save. Try again.");
    else router.refresh();
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border-2 border-accent/50 bg-sheet p-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-display text-lg font-semibold">Check the new music</p>
        <span className="text-sm text-muted">
          {score.pages.length} page{score.pages.length === 1 ? "" : "s"}
        </span>
      </div>
      <p className="-mt-2 text-sm text-muted">
        These are the digitized pages and what Claude read from them. Fix anything that&apos;s wrong, then add it to the
        music library.
      </p>

      <ul className="flex gap-2 overflow-x-auto pb-1">
        {score.pages.map((p) => (
          <li key={p.n} className="shrink-0">
            <Link
              href={`${score.viewer}?page=${p.n}`}
              className="block w-[150px] overflow-hidden rounded-lg border border-rule bg-white shadow-sm"
              style={{ aspectRatio: `${p.w} / ${p.h}` }}
              aria-label={`Page ${p.n}`}
            >
              {p.url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.url} alt={`Page ${p.n}`} className="h-full w-full object-contain" />
              )}
            </Link>
          </li>
        ))}
      </ul>
      <div className="-mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <ScanButton scoreId={score.id} pages={score.scan} label="Redigitize" />
        {score.hasOriginals && (
          <Link href={`${score.viewer}?originals=1`} className="text-accent-ink underline">
            Show original pictures
          </Link>
        )}
      </div>

      {reading ? (
        <p className="rounded-xl bg-accent-soft/60 px-3 py-2 text-sm">Claude is reading the music for its details…</p>
      ) : score.status === "error" ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span className="text-danger">{score.error || "Reading the music didn't work."}</span>
          <ReadMusicButton scoreId={score.id} label="Read again" />
        </div>
      ) : null}

      <div className={cx("grid gap-2 sm:grid-cols-2", reading && "pointer-events-none opacity-60")}>
        <label className="flex flex-col gap-1 text-sm sm:col-span-2">
          <span className="font-medium">Name of the piece or book</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="min-h-10 rounded-xl border border-rule bg-paper px-3 text-[15px]"
          />
        </label>
        {FIELDS.map((f) => (
          <label key={f.key} className="flex flex-col gap-1 text-sm">
            <span className="font-medium">{f.label}</span>
            <input
              value={details[f.key]}
              placeholder={f.placeholder}
              onChange={(e) => setDetails((d) => ({ ...d, [f.key]: e.target.value }))}
              className="min-h-10 rounded-xl border border-rule bg-paper px-3 text-[15px]"
            />
          </label>
        ))}
      </div>
      {!reading && (score.book || score.sections.length > 0) && (
        <div className="text-sm">
          {score.book && <p className="text-muted">Book: {score.book}</p>}
          {score.sections.length > 0 && (
            <>
              <p className="font-medium">
                {score.sections.length} piece{score.sections.length === 1 ? "" : "s"} found
              </p>
              <ol className="mt-1 divide-y divide-rule">
                {score.sections.map((s, i) => (
                  <li key={`${s.start_page}-${i}`} className="flex gap-2 py-1">
                    <span className="min-w-0 flex-1">{sectionLabel(s)}</span>
                    <span className="shrink-0 tabular-nums text-muted">{pageRange(s)}</span>
                  </li>
                ))}
              </ol>
            </>
          )}
        </div>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={addToLibrary} disabled={busy || reading} className="flex-1">
          {busy ? "Adding…" : "Looks right: add to Music library"}
        </Button>
        <form
          action={deleteScore}
          onSubmit={(e) => {
            if (!window.confirm(`Throw away "${title || score.title}"? The pages and pictures are deleted.`)) e.preventDefault();
          }}
        >
          <input type="hidden" name="score_id" value={score.id} />
          <button className="text-sm text-danger underline">Throw away</button>
        </form>
      </div>
    </div>
  );
}
