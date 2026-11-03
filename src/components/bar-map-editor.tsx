"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Pill, cx } from "@/components/ui";
import { detectBars, type DetectedLine } from "@/lib/bar-detect";
import { lineBars, shiftFollowing, type BarLine, type PageBars } from "@/lib/bar-map";
import { sectionAt, sectionLabel, type ScoreSection } from "@/lib/score-analysis";
import { saveBarMap } from "@/app/students/music-actions";

// The Bar map page: make the map once (the browser finds the lines of music
// and bar lines on each page, then Claude numbers them), then look through it
// and correct anything that's off. Every change saves by itself.

export type BarMapPage = { url: string | null; w: number; h: number; bars: PageBars | null };

// Wide enough for thin bar lines to survive, small enough to be quick on an iPad.
const DETECT_WIDTH = 1400;

async function pagePixels(url: string): Promise<{ data: Uint8ClampedArray; w: number; h: number }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`page image ${res.status}`);
  const bitmap = await createImageBitmap(await res.blob());
  const scale = Math.min(1, DETECT_WIDTH / bitmap.width);
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("no canvas");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  return { data: ctx.getImageData(0, 0, w, h).data, w, h };
}

type Phase =
  | { kind: "idle" }
  | { kind: "measuring"; done: number; total: number }
  | { kind: "numbering"; pages: number }
  | { kind: "error"; message: string }
  | { kind: "made"; pages: number; flagged: number };

export function BarMapEditor({
  scoreId,
  pages,
  sections,
}: {
  scoreId: string;
  pages: BarMapPage[];
  sections: ScoreSection[];
}) {
  const [map, setMap] = useState<(PageBars | null)[]>(() => pages.map((p) => p.bars));
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [selected, setSelected] = useState<{ page: number; line: number } | null>(null);
  const [onlyToCheck, setOnlyToCheck] = useState(false);
  const [save, setSave] = useState<"saved" | "saving" | "error" | null>(null);
  const pending = useRef(new Set<number>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The map as last set, for saving from a timer.
  const latest = useRef(map);

  // Pages that hold music (inside a piece), or every page if the pieces aren't known.
  const musicPages = useMemo(() => {
    const ns = pages.map((_, i) => i + 1);
    return sections.length ? ns.filter((n) => sectionAt(sections, n)) : ns;
  }, [pages, sections]);
  const made = musicPages.filter((n) => map[n - 1]);
  const checked = made.filter((n) => map[n - 1]?.checked);
  const toCheck = made.filter((n) => !map[n - 1]?.checked && map[n - 1]!.lines.some((l) => l.check));
  const busy = phase.kind === "measuring" || phase.kind === "numbering";

  const flush = async () => {
    timer.current = null;
    const pagesToSave = [...pending.current];
    pending.current.clear();
    if (!pagesToSave.length) return;
    setSave("saving");
    const out = await saveBarMap(
      scoreId,
      pagesToSave.map((page) => ({ page, bars: latest.current[page - 1] })),
    ).catch(() => ({ ok: false }));
    setSave(out.ok ? "saved" : "error");
  };

  // Saves a little after the last change, so a run of taps is one save.
  const change = (next: (PageBars | null)[], changedFrom: number) => {
    next.forEach((p, i) => {
      if (p && p !== map[i] && i + 1 >= changedFrom) pending.current.add(i + 1);
    });
    pending.current.add(changedFrom);
    latest.current = next;
    setMap(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, 700);
  };

  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
        void flush();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const make = async () => {
    if (checked.length && !confirm("Make the bar map again? Your corrections and checked pages will be replaced."))
      return;
    setSelected(null);
    const detected: { page: number; lines: DetectedLine[] }[] = [];
    try {
      for (let i = 0; i < musicPages.length; i++) {
        setPhase({ kind: "measuring", done: i, total: musicPages.length });
        const n = musicPages[i];
        const url = pages[n - 1]?.url;
        if (!url) continue;
        const px = await pagePixels(url);
        // Let the page repaint between pages.
        await new Promise((r) => setTimeout(r, 0));
        detected.push({ page: n, lines: detectBars(px.data, px.w, px.h) });
      }
    } catch (e) {
      console.error("bar map", e);
      setPhase({ kind: "error", message: "Couldn't open the page images. Reload the page and try again." });
      return;
    }
    if (!detected.some((d) => d.lines.length)) {
      setPhase({
        kind: "error",
        message: "No lines of music were found on these pages. A bar map needs clear printed pages (a PDF works best).",
      });
      return;
    }
    setPhase({ kind: "numbering", pages: detected.length });
    try {
      const res = await fetch(`/api/scores/${scoreId}/bars`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pages: detected }),
      });
      const out = (await res.json()) as
        | { ok: true; pages: number; flagged: number; map: { page: number; bars: PageBars }[] }
        | { ok: false; error: string };
      if (!out.ok) {
        setPhase({ kind: "error", message: out.error });
        return;
      }
      const next = [...latest.current];
      for (const m of out.map) next[m.page - 1] = m.bars;
      latest.current = next;
      setMap(next);
      setPhase({ kind: "made", pages: out.pages, flagged: out.flagged });
    } catch {
      setPhase({ kind: "error", message: "Numbering the bars didn't finish. Try again." });
    }
  };

  const shown = musicPages.filter(
    (n) => !onlyToCheck || (map[n - 1] && !map[n - 1]!.checked && map[n - 1]!.lines.some((l) => l.check)),
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-2xl border border-rule bg-sheet p-4">
        <p className="text-[16px]">
          The bar map shows where every bar is on each page, with its number. Lesson review uses it to highlight the bars
          a clip is about, so the same bar always lands in the same place.
        </p>
        {made.length > 0 ? (
          <p className="text-sm">
            <span className="font-semibold">
              {made.length} of {musicPages.length} pages mapped
            </span>
            {" · "}
            {checked.length} checked
            {toCheck.length > 0 && (
              <>
                {" · "}
                <span className="text-amber">
                  {toCheck.length} page{toCheck.length === 1 ? "" : "s"} with a line to look at
                </span>
              </>
            )}
          </p>
        ) : (
          <p className="text-sm text-muted">No bar map yet.</p>
        )}
        {phase.kind === "measuring" && (
          <p className="text-sm text-muted">
            Finding the bar lines: page {phase.done + 1} of {phase.total}…
          </p>
        )}
        {phase.kind === "numbering" && (
          <p className="text-sm text-muted">Claude is numbering the bars on {phase.pages} pages. This takes a minute or two…</p>
        )}
        {phase.kind === "error" && <p className="text-sm text-danger">{phase.message}</p>}
        {phase.kind === "made" && (
          <p className="text-sm text-sage">
            Done: {phase.pages} pages mapped.{" "}
            {phase.flagged > 0
              ? `${phase.flagged} line${phase.flagged === 1 ? " is" : "s are"} marked in yellow to look at.`
              : "Nothing looked off, but have a quick look through."}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={make} disabled={busy || musicPages.length === 0} variant={made.length ? "secondary" : "primary"}>
            {busy ? "Working…" : made.length ? "Make the bar map again" : "Make the bar map"}
          </Button>
          {toCheck.length > 0 && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={onlyToCheck} onChange={(e) => setOnlyToCheck(e.target.checked)} />
              Only pages to look at
            </label>
          )}
          <span className="ml-auto text-xs text-muted">
            {save === "saving" ? "Saving…" : save === "saved" ? "Saved" : save === "error" ? "Couldn't save" : ""}
          </span>
        </div>
        {made.length > 0 && (
          <p className="text-xs text-muted">
            Tap a line of music to fix it: change its first bar number, or tap on the music to add a bar line that was
            missed or take away one that isn&apos;t a bar line. The lines after it renumber themselves. Press{" "}
            <span className="font-semibold">Page looks right</span> once a page is right.
          </p>
        )}
      </div>

      <ol className="flex flex-col gap-6">
        {shown.map((n) => (
          <PageMap
            key={n}
            n={n}
            page={pages[n - 1]}
            bars={map[n - 1]}
            section={sectionAt(sections, n)}
            sections={sections}
            selected={selected?.page === n ? selected.line : null}
            onSelect={(line) => setSelected(line === null ? null : { page: n, line })}
            onChange={(next) => change(next, n)}
            map={map}
          />
        ))}
      </ol>
    </div>
  );
}

function PageMap({
  n,
  page,
  bars,
  section,
  sections,
  selected,
  onSelect,
  onChange,
  map,
}: {
  n: number;
  page: BarMapPage;
  bars: PageBars | null;
  section: ScoreSection | null;
  sections: ScoreSection[];
  selected: number | null;
  onSelect: (line: number | null) => void;
  onChange: (next: (PageBars | null)[]) => void;
  map: (PageBars | null)[];
}) {
  const box = useRef<HTMLDivElement>(null);
  const line = selected !== null ? bars?.lines[selected] : null;
  const flagged = bars ? bars.lines.filter((l) => l.check).length : 0;

  /** A new map with this page's lines changed, the following lines moved by `delta`. */
  const update = (lines: BarLine[], delta = 0, from = selected ?? 0, extra: Partial<PageBars> = {}) => {
    if (!bars) return;
    const next = [...map];
    next[n - 1] = { ...bars, ...extra, lines };
    onChange(shiftFollowing(next, n, from, delta));
  };

  const setLine = (i: number, patch: Partial<BarLine>, delta = 0) => {
    if (!bars) return;
    update(
      bars.lines.map((l, j) => (j === i ? { ...l, ...patch, check: false } : l)),
      delta,
      i,
    );
  };

  // Tapping the music: pick a line, or on the picked line add/remove a bar line.
  const tap = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!bars || !box.current) return;
    const r = box.current.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    const hit = bars.lines.findIndex((l) => {
      const pad = (l.bottom - l.top) * 0.6;
      return y >= l.top - pad && y <= l.bottom + pad && x >= l.left - 0.02 && x <= l.right + 0.02;
    });
    if (hit < 0) {
      onSelect(null);
      return;
    }
    if (hit !== selected) {
      onSelect(hit);
      return;
    }
    const l = bars.lines[hit];
    if (x <= l.left || x >= l.right) return;
    const near = l.dividers.findIndex((d) => Math.abs(d - x) < 0.015);
    if (near >= 0) setLine(hit, { dividers: l.dividers.filter((_, j) => j !== near) }, -1);
    else setLine(hit, { dividers: [...l.dividers, x].sort((a, b) => a - b) }, 1);
  };

  const pieceOptions = sections.filter((s) => s.start_page <= n && n <= s.end_page);

  return (
    <li id={`page-${n}`} className="scroll-mt-16">
      <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted">
        <span className="font-semibold text-ink">Page {n}</span>
        {section && <span className="min-w-0 truncate">{sectionLabel(section)}</span>}
        {bars?.checked ? (
          <Pill tone="sage">✓ Checked</Pill>
        ) : bars && flagged > 0 ? (
          <Pill tone="amber">
            {flagged} line{flagged === 1 ? "" : "s"} to look at
          </Pill>
        ) : bars && bars.lines.length === 0 ? (
          <Pill tone="muted">No lines of music found</Pill>
        ) : null}
        {bars && !bars.checked && bars.lines.length > 0 && (
          <button
            type="button"
            onClick={() => {
              onSelect(null);
              update(
                bars.lines.map((l) => ({ ...l, check: false })),
                0,
                0,
                { checked: true },
              );
            }}
            className="ml-auto min-h-8 rounded-lg border border-sage/50 px-2.5 font-medium text-sage"
          >
            Page looks right
          </button>
        )}
        {bars?.checked && (
          <button
            type="button"
            onClick={() => update(bars.lines, 0, 0, { checked: false })}
            className="ml-auto text-muted underline"
          >
            Not checked
          </button>
        )}
      </div>
      <div
        ref={box}
        onClick={tap}
        className={cx(
          "relative w-full overflow-hidden rounded-lg border border-rule bg-white shadow-sm",
          bars && "cursor-pointer",
        )}
        style={{ aspectRatio: `${page.w} / ${page.h}` }}
      >
        {page.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={page.url}
            alt={`Page ${n}`}
            className="absolute inset-0 h-full w-full select-none object-contain"
            loading="lazy"
            draggable={false}
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-sm text-neutral-500">Page {n}</div>
        )}
        {bars?.lines.map((l, i) => (
          <LineOverlay key={i} line={l} active={i === selected} />
        ))}
      </div>
      {line && selected !== null && (
        <div className="mt-2 flex flex-col gap-3 rounded-xl border border-accent/40 bg-accent-soft/40 p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">
              Line {selected + 1}: {barsLabel(line)}
            </span>
            <button type="button" onClick={() => onSelect(null)} className="ml-auto text-accent-ink underline">
              Done
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span>First bar on this line</span>
            <button
              type="button"
              onClick={() => setLine(selected, { first: Math.max(0, line.first - 1) }, line.first > 0 ? -1 : 0)}
              className="min-h-9 min-w-9 rounded-lg border border-rule bg-sheet"
              aria-label="One less"
            >
              −
            </button>
            <FirstBarInput
              key={`${selected}-${line.first}`}
              value={line.first}
              onCommit={(v) => setLine(selected, { first: v }, v - line.first)}
            />
            <button
              type="button"
              onClick={() => setLine(selected, { first: line.first + 1 }, 1)}
              className="min-h-9 min-w-9 rounded-lg border border-rule bg-sheet"
              aria-label="One more"
            >
              +
            </button>
            <span className="text-xs text-muted">0 = pickup bar</span>
          </div>
          {pieceOptions.length > 1 && (
            <label className="flex flex-wrap items-center gap-2">
              <span>Piece</span>
              <select
                value={line.piece}
                onChange={(e) => setLine(selected, { piece: e.target.value })}
                className="min-h-9 min-w-0 flex-1 rounded-lg border border-rule bg-sheet px-2"
              >
                <option value="">Not part of a piece</option>
                {pieceOptions.map((s, i) => (
                  <option key={i} value={sectionLabel(s)}>
                    {sectionLabel(s)}
                  </option>
                ))}
              </select>
            </label>
          )}
          <p className="text-xs text-muted">
            Tap on this line of music to add a bar line that was missed, or tap a red line to take it away.
          </p>
          <div>
            <button
              type="button"
              onClick={() => {
                onSelect(null);
                update(
                  bars!.lines.filter((_, j) => j !== selected),
                  0,
                  selected,
                );
              }}
              className="text-danger underline"
            >
              This isn&apos;t a line of music: remove it
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

/** A bar number box that changes the map only when the teacher is done typing. */
function FirstBarInput({ value, onCommit }: { value: number; onCommit: (v: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  const commit = () => {
    const v = Math.max(0, Math.round(Number(draft)));
    if (draft.trim() !== "" && Number.isFinite(v) && v !== value) onCommit(v);
    else setDraft(String(value));
  };
  return (
    <input
      type="number"
      inputMode="numeric"
      min={0}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      className="min-h-9 w-20 rounded-lg border border-rule bg-sheet px-2 text-center tabular-nums"
    />
  );
}

function barsLabel(l: BarLine): string {
  const last = l.first + l.dividers.length;
  return last > l.first ? `bars ${l.first}–${last}` : `bar ${l.first}`;
}

function LineOverlay({ line, active }: { line: BarLine; active: boolean }) {
  const pct = (v: number) => `${v * 100}%`;
  return (
    <div className="pointer-events-none absolute inset-0">
      <div
        className={cx(
          "absolute rounded-sm border",
          active
            ? "border-2 border-accent bg-accent/10"
            : line.check
              ? "border-amber bg-amber-300/25"
              : "border-accent/30",
        )}
        style={{
          left: pct(line.left),
          top: pct(line.top),
          width: pct(line.right - line.left),
          height: pct(line.bottom - line.top),
        }}
      />
      {line.dividers.map((x, i) => (
        <div
          key={i}
          className="absolute w-[2px] -translate-x-1/2 bg-red-500/80"
          style={{
            left: pct(x),
            top: pct(line.top - (line.bottom - line.top) * 0.25),
            height: pct((line.bottom - line.top) * 1.5),
          }}
        />
      ))}
      {lineBars(line).map((b) => (
        <span
          key={b.n}
          className={cx(
            "absolute -translate-y-full rounded px-0.5 text-[10px] font-semibold leading-tight tabular-nums sm:text-[11px]",
            active ? "bg-accent text-white" : "bg-white/90 text-accent-ink",
          )}
          style={{ left: pct(b.x0 + 0.003), top: pct(line.top - (line.bottom - line.top) * 0.3) }}
        >
          {b.n}
        </span>
      ))}
    </div>
  );
}
