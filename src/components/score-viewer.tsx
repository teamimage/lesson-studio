"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { cx } from "@/components/ui";
import { pageRange, sectionAt, sectionLabel, type ScoreSection } from "@/lib/score-analysis";
import { barsText, viewerHref, type MusicRef, type PageBox } from "@/lib/music-links";
import { ScanButton, type ScanSource } from "@/components/scan-music";

// Read-only sheet music: looking at the music outside the music stand, so
// nothing is logged and no lesson or timer starts.

export type ViewerPage = {
  url: string | null;
  w: number;
  h: number;
  /** The photo a digitized page was made from (viewer only, when asked for). */
  original?: { url: string | null; w: number; h: number; whole: boolean } | null;
  /** Where to digitize this page from (viewer only). */
  scan?: ScanSource;
};
export type ViewerScore = {
  id: string;
  title: string;
  pages: ViewerPage[];
  sections: ScoreSection[];
};

/** One page image, with an optional highlighted box (e.g. the bars a clip is about). */
export function MusicPageImage({
  page,
  number,
  box,
  className,
  onLoad,
}: {
  page: ViewerPage;
  number: number;
  box?: PageBox | null;
  className?: string;
  onLoad?: () => void;
}) {
  return (
    <div
      className={cx("relative w-full overflow-hidden bg-white", className)}
      style={{ aspectRatio: `${page.w} / ${page.h}` }}
    >
      {page.url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={page.url}
          alt={`Page ${number}`}
          className="absolute inset-0 h-full w-full object-contain"
          loading="lazy"
          onLoad={onLoad}
        />
      ) : (
        <div className="absolute inset-0 grid place-items-center text-sm text-neutral-500">Page {number}</div>
      )}
      {box && (
        <div
          className="pointer-events-none absolute rounded-md border-2 border-amber-500 bg-amber-300/25 shadow-[0_0_0_9999px_rgba(0,0,0,0.12)]"
          style={{
            left: `${box.x * 100}%`,
            top: `${box.y * 100}%`,
            width: `${box.w * 100}%`,
            height: `${box.h * 100}%`,
          }}
        />
      )}
    </div>
  );
}

/**
 * The whole viewer page: pick the whole book or one piece, and scroll
 * through its pages. `from`/`to` open it on one piece; `page` scrolls there.
 */
export function ScoreViewer({
  score,
  from,
  to,
  page,
  originals,
}: {
  score: ViewerScore;
  from?: number;
  to?: number;
  page?: number;
  /** Open on the original photos instead of the digitized pages. */
  originals?: boolean;
}) {
  const total = score.pages.length;
  const hasOriginals = score.pages.some((p) => p.original);
  const [showOriginals, setShowOriginals] = useState(!!originals && hasOriginals);
  const initial = from && from >= 1 && from <= total ? { from, to: Math.min(Math.max(to ?? from, from), total) } : null;
  const [range, setRange] = useState<{ from: number; to: number } | null>(initial);
  const scrolled = useRef(false);
  const target = page ?? range?.from;

  useEffect(() => {
    if (scrolled.current || !target || target <= 1) return;
    scrolled.current = true;
    document.getElementById(`page-${target}`)?.scrollIntoView({ block: "start" });
  }, [target]);

  const shown = score.pages
    .map((p, i) => ({ page: p, n: i + 1 }))
    .filter(({ n }) => !range || (n >= range.from && n <= range.to));
  const current = range ? score.sections.find((s) => s.start_page === range.from && s.end_page === range.to) : null;

  const pick = (value: string) => {
    if (!value) setRange(null);
    else {
      const s = score.sections[Number(value)];
      if (s) setRange({ from: s.start_page, to: s.end_page });
    }
    window.scrollTo({ top: 0 });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 bg-paper/95 py-2 backdrop-blur">
        <select
          value={current ? String(score.sections.indexOf(current)) : ""}
          onChange={(e) => pick(e.target.value)}
          className="min-h-10 min-w-0 flex-1 rounded-xl border border-rule bg-sheet px-3 text-sm font-medium"
          aria-label="Piece"
        >
          <option value="">Whole book · {total} pages</option>
          {score.sections.map((s, i) => (
            <option key={`${s.start_page}-${i}`} value={i}>
              {sectionLabel(s)} · {pageRange(s)}
            </option>
          ))}
        </select>
        {range && (
          <button
            type="button"
            onClick={() => pick("")}
            className="min-h-10 rounded-xl border border-rule px-3 text-sm text-accent-ink"
          >
            Whole book
          </button>
        )}
        {hasOriginals && (
          <button
            type="button"
            onClick={() => setShowOriginals((v) => !v)}
            aria-pressed={showOriginals}
            className={cx(
              "min-h-10 rounded-xl border px-3 text-sm",
              showOriginals ? "border-accent bg-accent text-white" : "border-rule text-accent-ink",
            )}
          >
            {showOriginals ? "Show digitized pages" : "Show original pictures"}
          </button>
        )}
      </div>
      <p className="text-xs text-muted">
        {showOriginals
          ? "These are the photos as taken. Everywhere else shows the digitized pages. If a page was cropped wrong, redo it from the whole photo."
          : "Preview only: this doesn't open the music stand, start a lesson or log page turns."}
      </p>
      <ol className="flex flex-col gap-4">
        {shown.map(({ page: p, n }) => {
          const sec = sectionAt(score.sections, n);
          return (
            <li key={n} id={`page-${n}`} className="scroll-mt-16">
              <div className="mb-1 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs text-muted">
                <span className="font-semibold text-ink">Page {n}</span>
                {sec && <span className="min-w-0 flex-1 truncate">{sectionLabel(sec)}</span>}
                {showOriginals && p.scan && (
                  <span className="flex flex-wrap gap-x-3 text-sm">
                    <ScanButton scoreId={score.id} pages={[p.scan]} label="Redigitize" />
                    <ScanButton
                      scoreId={score.id}
                      pages={[p.scan]}
                      label="Redo from the whole photo"
                      wholePhoto
                    />
                  </span>
                )}
              </div>
              <MusicPageImage
                page={showOriginals && p.original ? p.original : p}
                number={n}
                className="rounded-lg border border-rule shadow-sm"
              />
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/**
 * The music next to a clip in the popup player: the page the clip is about,
 * the bars highlighted, and arrows to flip through the rest of the piece.
 */
export function MusicPanel({ music, score, studentId }: { music: MusicRef; score: ViewerScore; studentId: string }) {
  const [page, setPage] = useState(music.page);
  const scroller = useRef<HTMLDivElement>(null);
  const p = score.pages[page - 1];
  const box = page === music.page ? music.box : null;
  const from = Math.max(1, music.fromPage);
  const to = Math.min(score.pages.length, music.toPage);

  // Bring the highlighted bars into view once the page is drawn.
  const reveal = () => {
    const el = scroller.current;
    if (!el || !box) return;
    const inner = el.firstElementChild as HTMLElement | null;
    const h = inner?.offsetHeight ?? 0;
    el.scrollTop = Math.max(0, box.y * h - 24);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-neutral-900">
      <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-white/80">
        <span className="min-w-0 flex-1 truncate">
          <span className="font-semibold text-white">{music.piece || score.title}</span>
          {" · "}page {page}
          {page === music.page && music.bars ? ` · ${barsText(music.bars)}` : ""}
        </span>
        {to > from && (
          <>
            <button
              type="button"
              onClick={() => setPage((n) => Math.max(from, n - 1))}
              disabled={page <= from}
              className="min-h-8 rounded-lg bg-white/10 px-2.5 disabled:opacity-30"
              aria-label="Previous page"
            >
              ‹
            </button>
            <button
              type="button"
              onClick={() => setPage((n) => Math.min(to, n + 1))}
              disabled={page >= to}
              className="min-h-8 rounded-lg bg-white/10 px-2.5 disabled:opacity-30"
              aria-label="Next page"
            >
              ›
            </button>
          </>
        )}
        <Link href={viewerHref(studentId, score.id, { from, to, page })} target="_blank" className="shrink-0 underline">
          Open music
        </Link>
      </div>
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto">
        {p ? (
          <MusicPageImage key={page} page={p} number={page} box={box} onLoad={reveal} />
        ) : (
          <p className="p-3 text-sm text-white/60">That page isn&apos;t in the upload.</p>
        )}
      </div>
    </div>
  );
}
