"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { TablesInsert } from "@/lib/supabase/types";
import { cx } from "@/components/ui";
import {
  formatClock,
  type Rect,
  type StandEvent,
  type StandEventKind,
  type StandScore,
} from "@/lib/stand-timeline";
import { pageRange, sectionAt, sectionLabel } from "@/lib/score-analysis";

type Row = TablesInsert<"stand_events"> & { id: string; at: string };
type Current = { scoreId: string; page: number } | null;
type Mark = { id: string; scoreId: string | null; page: number | null; rect: Rect };

const FLUSH_EVERY_MS = 4000;

// Browser full screen, with the older webkit names iPad Safari still uses.
type FsDoc = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => Promise<void> | void };
type FsEl = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };
function fullscreenElement(): Element | null {
  const d = document as FsDoc;
  return d.fullscreenElement ?? d.webkitFullscreenElement ?? null;
}
async function enterFullscreen(): Promise<void> {
  const el = document.documentElement as FsEl;
  try {
    if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: "hide" });
    else await el.webkitRequestFullscreen?.();
  } catch {}
}
async function exitFullscreen(): Promise<void> {
  const d = document as FsDoc;
  if (!fullscreenElement()) return;
  try {
    if (d.exitFullscreen) await d.exitFullscreen();
    else await d.webkitExitFullscreen?.();
  } catch {}
}

function lastPosition(events: StandEvent[]): Current {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.kind === "open" && e.score_id) return { scoreId: e.score_id, page: e.page ?? 1 };
    if (e.kind === "close" || e.kind === "end") return null;
  }
  return null;
}

function beep() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 1200;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.6, ctx.currentTime + 0.02);
    gain.gain.setValueAtTime(0.6, ctx.currentTime + 0.45);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.5);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.55);
    setTimeout(() => ctx.close().catch(() => {}), 1000);
  } catch {
    // No sound available; the flash still marks the moment on camera.
  }
}

export function MusicStand({
  lessonId,
  studentId,
  teacherId,
  studentName,
  scores,
  priorEvents,
}: {
  lessonId: string;
  studentId: string;
  teacherId: string;
  studentName: string;
  scores: StandScore[];
  priorEvents: StandEvent[];
}) {
  const router = useRouter();
  const byId = useMemo(() => new Map(scores.map((s) => [s.id, s])), [scores]);
  const [current, setCurrent] = useState<Current>(() => {
    const pos = lastPosition(priorEvents);
    return pos && byId.has(pos.scoreId) ? pos : null;
  });
  const [pickerOpen, setPickerOpen] = useState(() => lastPosition(priorEvents) === null);
  const [markMode, setMarkMode] = useState(false);
  const [fitWidth, setFitWidth] = useState(false);
  // Full screen: only the music shows (browser full screen where it exists,
  // and the stand's own bars hidden everywhere).
  const [full, setFull] = useState(false);
  const [flash, setFlash] = useState(false);
  const [synced, setSynced] = useState(() => priorEvents.some((e) => e.kind === "sync"));
  const [syncHintHidden, setSyncHintHidden] = useState(false);
  const [pending, setPending] = useState(0);
  const [offline, setOffline] = useState(false);
  const [toast, setToast] = useState<{ id: string; note: string } | null>(null);
  const [marks, setMarks] = useState<Mark[]>(() =>
    priorEvents
      .filter((e) => e.kind === "mark" && e.rect)
      .map((e) => ({ id: e.id, scoreId: e.score_id, page: e.page, rect: e.rect! })),
  );
  const [startedAt, setStartedAt] = useState<number | null>(() =>
    priorEvents.length ? Date.parse(priorEvents[0].at) : null,
  );
  const [now, setNow] = useState(() => Date.now());

  // ------------------------------------------------------------ event log
  // Every event is kept in a local queue (also in localStorage) and sent in
  // the background, so a dropped Wi-Fi connection loses nothing.
  const storageKey = `stand-queue-${lessonId}`;
  const queue = useRef<Row[]>([]);
  const rows = useRef(new Map<string, Row>());
  const flushing = useRef(false);
  const supabase = useMemo(() => createClient(), []);

  const persist = useCallback(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(queue.current));
    } catch {}
    setPending(queue.current.length);
  }, [storageKey]);

  const flush = useCallback(async () => {
    if (flushing.current || queue.current.length === 0) return;
    flushing.current = true;
    const batch = [...queue.current];
    const { error } = await supabase.from("stand_events").upsert(batch);
    flushing.current = false;
    if (error) {
      setOffline(true);
      return;
    }
    setOffline(false);
    const sent = new Set(batch.map((r) => r.id));
    // A row edited while sending (a note) was re-queued as a new object; keep it.
    queue.current = queue.current.filter((r) => !(sent.has(r.id) && batch.includes(r)));
    persist();
  }, [supabase, persist]);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? "[]") as Row[];
      if (Array.isArray(saved) && saved.length) {
        queue.current = saved;
        for (const r of saved) rows.current.set(r.id, r);
        persist();
      }
    } catch {}
    flush();
    const timer = setInterval(flush, FLUSH_EVERY_MS);
    const onOnline = () => flush();
    window.addEventListener("online", onOnline);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", onOnline);
    };
  }, [storageKey, flush, persist]);

  const log = useCallback(
    (kind: StandEventKind, extra: Partial<Row> = {}): Row => {
      const at = new Date().toISOString();
      const row: Row = {
        id: crypto.randomUUID(),
        teacher_id: teacherId,
        student_id: studentId,
        lesson_id: lessonId,
        kind,
        at,
        score_id: null,
        page: null,
        rect: null,
        note: null,
        ...extra,
      };
      rows.current.set(row.id, row);
      queue.current.push(row);
      persist();
      setStartedAt((s) => s ?? Date.parse(at));
      void flush();
      return row;
    },
    [teacherId, studentId, lessonId, persist, flush],
  );

  // The first time the stand opens for a lesson, note it (as "no piece open"),
  // so the lesson card on the teacher's phone sees the stand is running.
  const openedLogged = useRef(priorEvents.length > 0);
  useEffect(() => {
    if (openedLogged.current) return;
    openedLogged.current = true;
    if (queue.current.length === 0) log("close");
  }, [log]);

  // ------------------------------------------------------------ navigation
  const score = current ? byId.get(current.scoreId) : undefined;
  const page = score && current ? score.pages[current.page - 1] : undefined;

  const toggleFull = useCallback(() => {
    if (full) void exitFullscreen();
    else void enterFullscreen();
    setFull(!full);
  }, [full]);
  // Leaving browser full screen (Esc, a swipe) brings the bars back too.
  useEffect(() => {
    const onChange = () => {
      if (!fullscreenElement()) setFull(false);
    };
    document.addEventListener("fullscreenchange", onChange);
    document.addEventListener("webkitfullscreenchange", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      document.removeEventListener("webkitfullscreenchange", onChange);
      void exitFullscreen();
    };
  }, []);

  const go = useCallback(
    (next: Current) => {
      setCurrent(next);
      setMarkMode(false);
      if (next) log("open", { score_id: next.scoreId, page: next.page });
      else log("close");
    },
    [log],
  );

  const turn = useCallback(
    (dir: 1 | -1) => {
      if (!current || !score) return;
      const p = current.page + dir;
      if (p < 1 || p > score.pages.length) return;
      go({ scoreId: current.scoreId, page: p });
    },
    [current, score, go],
  );

  const piece = useMemo(
    () => (score && current ? sectionAt(score.sections, current.page) : null),
    [score, current],
  );

  // Page-turner pedals and keyboards send arrow / page keys.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest("input, textarea")) return;
      if (["ArrowRight", "PageDown", "ArrowDown", " "].includes(e.key)) {
        e.preventDefault();
        turn(1);
      } else if (["ArrowLeft", "PageUp", "ArrowUp"].includes(e.key)) {
        e.preventDefault();
        turn(-1);
      } else if (e.key === "Escape") setMarkMode(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [turn]);

  // Load the next page ahead of time so turns are instant.
  useEffect(() => {
    const next = score && current ? score.pages[current.page] : undefined;
    if (next?.url) new Image().src = next.url;
  }, [score, current]);

  // Keep the screen awake while the stand is open.
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    const acquire = () => {
      if (document.visibilityState === "visible")
        navigator.wakeLock
          ?.request("screen")
          .then((l) => (lock = l))
          .catch(() => {});
    };
    acquire();
    document.addEventListener("visibilitychange", acquire);
    return () => {
      document.removeEventListener("visibilitychange", acquire);
      lock?.release().catch(() => {});
    };
  }, []);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // ------------------------------------------------------------ layout
  const stageRef = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) =>
      setStage({ w: entry.contentRect.width, h: entry.contentRect.height }),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const fit = page ? (fitWidth ? stage.w / page.w : Math.min(stage.w / page.w, stage.h / page.h)) : 1;
  const box = page ? { w: Math.floor(page.w * fit), h: Math.floor(page.h * fit) } : { w: 0, h: 0 };

  // Taps and swipes on the page turn it; in mark mode a drag draws a box.
  const down = useRef<{ x: number; y: number } | null>(null);
  const [drag, setDrag] = useState<Rect | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  function rel(e: React.PointerEvent) {
    const r = boxRef.current!.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    };
  }

  function onStageDown(e: React.PointerEvent) {
    down.current = { x: e.clientX, y: e.clientY };
  }
  function onStageUp(e: React.PointerEvent) {
    const start = down.current;
    down.current = null;
    if (!start || markMode) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) return turn(dx < 0 ? 1 : -1);
    if (Math.abs(dx) < 12 && Math.abs(dy) < 12) {
      const r = stageRef.current!.getBoundingClientRect();
      turn(e.clientX - r.left < r.width / 2 ? -1 : 1);
    }
  }

  const anchor = useRef<{ x: number; y: number } | null>(null);
  function onMarkDown(e: React.PointerEvent) {
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    anchor.current = rel(e);
    setDrag({ ...anchor.current, w: 0, h: 0 });
  }
  function onMarkMove(e: React.PointerEvent) {
    if (!anchor.current) return;
    const p = rel(e);
    const a = anchor.current;
    setDrag({ x: Math.min(a.x, p.x), y: Math.min(a.y, p.y), w: Math.abs(p.x - a.x), h: Math.abs(p.y - a.y) });
  }
  function onMarkUp(e: React.PointerEvent) {
    e.stopPropagation();
    const rect = drag;
    anchor.current = null;
    setDrag(null);
    if (!rect || !current || rect.w < 0.03 || rect.h < 0.02) return;
    const rounded = {
      x: +rect.x.toFixed(4),
      y: +rect.y.toFixed(4),
      w: +rect.w.toFixed(4),
      h: +rect.h.toFixed(4),
    };
    const row = log("mark", { score_id: current.scoreId, page: current.page, rect: rounded });
    setMarks((m) => [...m, { id: row.id, scoreId: current.scoreId, page: current.page, rect: rounded }]);
    setMarkMode(false);
    setToast({ id: row.id, note: "" });
  }

  function saveNote() {
    if (!toast) return;
    const row = rows.current.get(toast.id);
    if (row && toast.note.trim()) {
      const updated = { ...row, note: toast.note.trim().slice(0, 500) };
      rows.current.set(row.id, updated);
      queue.current = [...queue.current.filter((r) => r.id !== row.id), updated];
      persist();
      void flush();
    }
    setToast(null);
  }

  function sync() {
    beep();
    setFlash(true);
    setTimeout(() => setFlash(false), 900);
    log("sync");
    setSynced(true);
  }

  async function end() {
    log("end");
    const deadline = Date.now() + 4000;
    while (queue.current.length && Date.now() < deadline) {
      await flush();
      if (queue.current.length) await new Promise((r) => setTimeout(r, 400));
    }
    router.push(`/lessons/${lessonId}#timeline`);
  }

  const pageMarks = marks.filter((m) => current && m.scoreId === current.scoreId && m.page === current.page);

  // ------------------------------------------------------------ render
  return (
    <div className="fixed inset-0 flex flex-col bg-[#ece6dc] text-ink dark:bg-[#1c1916]">
      <header className={cx(full && "hidden", "flex shrink-0 items-center gap-1.5 overflow-x-auto border-b border-rule bg-sheet px-2 py-1.5 pt-[max(0.375rem,env(safe-area-inset-top))]")}>
        <Link href={`/lessons/${lessonId}/live`} className="flex min-h-10 shrink-0 items-center px-2 text-sm text-accent-ink">
          ‹ Lesson
        </Link>
        <button
          onClick={() => setPickerOpen(true)}
          className="flex min-h-10 min-w-0 shrink items-center gap-1 rounded-lg px-2 text-left font-semibold hover:bg-accent-soft"
        >
          <span className="truncate">
            {score ? (piece ? sectionLabel(piece, false) : score.title) : "Choose music"}
          </span>
          <span aria-hidden className="text-muted">
            ▾
          </span>
        </button>
        {score && current && (
          <span className="shrink-0 text-sm tabular-nums text-muted">
            p. {current.page}/{score.pages.length}
          </span>
        )}
        <span className="ml-auto shrink-0 text-sm tabular-nums text-muted">
          {startedAt ? formatClock((now - startedAt) / 1000) : studentName}
        </span>
        <ToolButton active={markMode} disabled={!page} onClick={() => setMarkMode((m) => !m)}>
          ▭ Mark
        </ToolButton>
        <ToolButton onClick={sync}>◉ Sync</ToolButton>
        <ToolButton active={fitWidth} disabled={!page} onClick={() => setFitWidth((f) => !f)}>
          ↔ Fit
        </ToolButton>
        <ToolButton onClick={toggleFull}>⤢ Full screen</ToolButton>
        <span
          title={pending ? `${pending} change(s) waiting to save` : "Saved"}
          className={cx(
            "mx-1 h-2.5 w-2.5 shrink-0 rounded-full",
            offline ? "bg-danger" : pending ? "bg-amber" : "bg-sage",
          )}
        />
        <button onClick={end} className="min-h-10 shrink-0 rounded-lg bg-accent px-3 text-sm font-semibold text-white">
          End
        </button>
      </header>

      {full && (
        <button
          onClick={toggleFull}
          aria-label="Leave full screen"
          className="absolute right-[max(0.5rem,env(safe-area-inset-right))] top-[max(0.5rem,env(safe-area-inset-top))] z-20 flex h-10 min-w-10 items-center justify-center rounded-full bg-black/25 px-3 text-sm font-semibold text-white opacity-60 hover:opacity-100"
        >
          {score && current ? `${current.page}/${score.pages.length} ` : ""}⤡
        </button>
      )}
      {!full && !synced && !syncHintHidden && (
        <div className="flex shrink-0 items-center gap-2 bg-amber-soft px-3 py-1.5 text-sm">
          <span className="flex-1">
            Camera rolling? Tap <b>◉ Sync</b> once where the camera can hear it. It lines the video up with the music.
          </span>
          <button onClick={() => setSyncHintHidden(true)} className="shrink-0 text-muted underline">
            Hide
          </button>
        </div>
      )}
      {markMode && !full && (
        <div className="shrink-0 bg-accent-soft px-3 py-1.5 text-sm">
          Drag a box around the bars to mark. They will show with a link to this moment in the video.
        </div>
      )}

      <div
        ref={stageRef}
        className={cx(
          "relative min-h-0 flex-1 select-none",
          fitWidth ? "overflow-y-auto" : "overflow-hidden",
          !markMode && "touch-pan-y",
        )}
        onPointerDown={onStageDown}
        onPointerUp={onStageUp}
        onPointerCancel={() => (down.current = null)}
      >
        {page ? (
          <div className={cx("flex min-h-full justify-center", fitWidth ? "items-start" : "items-center")}>
            <div ref={boxRef} className="relative bg-white shadow-md" style={{ width: box.w, height: box.h }}>
              {page.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={page.url} alt="" draggable={false} className="h-full w-full" />
              ) : (
                <div className="flex h-full items-center justify-center text-muted">This page didn&apos;t load.</div>
              )}
              {pageMarks.map((m) => (
                <div
                  key={m.id}
                  className="pointer-events-none absolute rounded-sm border-2 border-accent/60 bg-accent/10"
                  style={rectStyle(m.rect)}
                />
              ))}
              {markMode && (
                <div
                  className="absolute inset-0 cursor-crosshair touch-none"
                  onPointerDown={onMarkDown}
                  onPointerMove={onMarkMove}
                  onPointerUp={onMarkUp}
                >
                  {drag && (
                    <div className="absolute rounded-sm border-2 border-accent bg-accent/15" style={rectStyle(drag)} />
                  )}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
            <p className="text-lg font-semibold">No music on the stand</p>
            <p className="max-w-sm text-sm text-muted">
              Scales, games or talking. Open a piece when you go back to the music.
            </p>
            <button onClick={() => setPickerOpen(true)} className="min-h-11 rounded-xl bg-accent px-5 font-semibold text-white">
              Choose music
            </button>
          </div>
        )}
      </div>

      {toast && (
        <div className="absolute inset-x-2 bottom-[max(0.5rem,env(safe-area-inset-bottom))] z-20 mx-auto flex max-w-xl flex-col gap-2 rounded-2xl border border-rule bg-sheet p-3 shadow-lg">
          <div className="text-sm font-semibold">Marked. Add a practice note? (optional)</div>
          <div className="flex gap-2">
            <input
              autoFocus
              value={toast.note}
              onChange={(e) => setToast({ ...toast, note: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && saveNote()}
              placeholder="e.g. Slow bow, stop before the string crossing"
              className="min-h-11 min-w-0 flex-1 rounded-xl border border-rule bg-paper px-3 text-[16px]"
            />
            <button onClick={saveNote} className="min-h-11 rounded-xl bg-accent px-4 font-semibold text-white">
              {toast.note.trim() ? "Save" : "Skip"}
            </button>
          </div>
        </div>
      )}

      {pickerOpen && (
        <div className="absolute inset-0 z-30 flex flex-col bg-paper">
          <div className="flex items-center gap-2 border-b border-rule bg-sheet px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
            <div className="flex-1 font-semibold">{studentName}&apos;s music</div>
            {(current || priorEvents.length > 0 || startedAt) && (
              <button onClick={() => setPickerOpen(false)} className="min-h-10 px-2 text-accent-ink">
                Close
              </button>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="grid auto-rows-min grid-cols-2 gap-3 p-3 sm:grid-cols-3 lg:grid-cols-5">
            {scores.map((s) => (
              <button
                key={s.id}
                onClick={() => {
                  setPickerOpen(false);
                  if (current?.scoreId !== s.id) go({ scoreId: s.id, page: 1 });
                }}
                className={cx(
                  "flex flex-col overflow-hidden rounded-xl border bg-sheet text-left",
                  current?.scoreId === s.id ? "border-accent ring-2 ring-accent/30" : "border-rule",
                )}
              >
                <div className="aspect-[3/4] w-full overflow-hidden bg-white">
                  {s.pages[0]?.url && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={s.pages[0].url} alt="" className="h-full w-full object-cover object-top" />
                  )}
                </div>
                <div className="px-2 py-1.5 text-sm font-semibold leading-tight">{s.title}</div>
              </button>
            ))}
            <button
              onClick={() => {
                setPickerOpen(false);
                if (current) go(null);
              }}
              className="flex aspect-[3/4] flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-rule bg-sheet p-3 text-center"
            >
              <span className="font-semibold">No music</span>
              <span className="text-xs text-muted">Scales, games, talking</span>
            </button>
          </div>
          {scores
            .filter((s) => s.sections.length > 1)
            .map((s) => (
              <section key={s.id} className="px-3 pb-4">
                <h2 className="mb-1.5 text-sm font-semibold uppercase tracking-[0.08em] text-muted">
                  Pieces in {s.title}
                </h2>
                <ul className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                  {s.sections.map((sec, i) => {
                    const here = current?.scoreId === s.id && sectionAt(s.sections, current.page) === sec;
                    return (
                      <li key={`${sec.start_page}-${i}`}>
                        <button
                          onClick={() => {
                            setPickerOpen(false);
                            go({ scoreId: s.id, page: Math.min(sec.start_page, s.pages.length) });
                          }}
                          className={cx(
                            "flex min-h-11 w-full items-baseline gap-2 rounded-xl border bg-sheet px-3 py-2 text-left text-sm",
                            here ? "border-accent ring-2 ring-accent/30" : "border-rule",
                            sec.status === "current" && "font-semibold",
                          )}
                        >
                          <span className="min-w-0 flex-1">{sectionLabel(sec)}</span>
                          {sec.status === "current" && <span className="shrink-0 text-xs text-accent-ink">Now</span>}
                          <span className="shrink-0 tabular-nums text-xs text-muted">{pageRange(sec)}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
          {scores.length === 0 && (
            <p className="p-4 text-center text-sm text-muted">
              No music yet.{" "}
              <Link href={`/students/${studentId}/music`} className="text-accent-ink underline">
                Add music
              </Link>
            </p>
          )}
        </div>
      )}

      {flash && (
        <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center bg-white text-[18vmin] font-bold text-accent">
          SYNC
        </div>
      )}
    </div>
  );
}

function rectStyle(r: Rect) {
  return { left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` };
}

function ToolButton({
  active,
  disabled,
  onClick,
  children,
}: {
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cx(
        "min-h-10 shrink-0 rounded-lg px-2.5 text-sm font-medium disabled:opacity-40",
        active ? "bg-accent text-white" : "text-ink hover:bg-accent-soft",
      )}
    >
      {children}
    </button>
  );
}
