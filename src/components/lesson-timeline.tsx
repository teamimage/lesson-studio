"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { setRecordingStart } from "@/app/lessons/recording-actions";
import type { RecordingWithUrl } from "@/lib/recordings";
import {
  buildBlocks,
  buildSegments,
  cropStyle,
  formatClock,
  segmentAt,
  type StandEvent,
  type StandScore,
} from "@/lib/stand-timeline";
import { cx } from "@/components/ui";
import { LessonVideo } from "@/components/lesson-video";

/**
 * A lesson video next to the music that was open on the stand at each moment:
 * the video split by piece, the page following along as it plays, and the
 * bars the teacher marked, each linked to its moment in the video.
 */
export function LessonTimeline({
  recordings,
  events,
  scores,
}: {
  recordings: RecordingWithUrl[];
  events: StandEvent[];
  scores: StandScore[];
}) {
  const playable = recordings.filter((r) => r.url);
  const [selectedId, setSelectedId] = useState(playable[0]?.id);
  const rec = playable.find((r) => r.id === selectedId) ?? playable[0];
  const byId = useMemo(() => new Map(scores.map((s) => [s.id, s])), [scores]);
  const segments = useMemo(() => buildSegments(events), [events]);
  const blocks = useMemo(() => buildBlocks(segments), [segments]);
  const marks = events.filter((e) => e.kind === "mark" && e.rect && e.score_id);
  const syncs = events.filter((e) => e.kind === "sync");

  const videoRef = useRef<HTMLVideoElement>(null);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState<number | null>(rec?.duration_seconds ? Number(rec.duration_seconds) : null);
  const [starts, setStarts] = useState<Record<string, { at: number | null; source: string | null }>>(() =>
    Object.fromEntries(
      recordings.map((r) => [r.id, { at: r.started_at ? Date.parse(r.started_at) : null, source: r.started_at_source }]),
    ),
  );
  const [lineupOpen, setLineupOpen] = useState(false);
  const [saving, startSaving] = useTransition();

  if (events.length === 0) {
    return (
      <p className="text-sm text-muted">
        Nothing from the music stand yet. Open the music stand during the lesson and it will show here, lined up with
        the video.
      </p>
    );
  }

  const start = rec ? starts[rec.id] : undefined;
  const t0 = start?.at ?? null;
  const toVideo = (wall: number) => (t0 === null ? null : (wall - t0) / 1000);
  const wallNow = t0 === null ? null : t0 + time * 1000;
  const nowSeg = wallNow === null ? null : segmentAt(segments, wallNow);
  const nowScore = nowSeg?.scoreId ? byId.get(nowSeg.scoreId) : undefined;
  const nowPage = nowScore && nowSeg?.page ? nowScore.pages[nowSeg.page - 1] : undefined;
  const dur = duration ?? Infinity;
  const firstEvent = Date.parse(events[0].at);
  const lastEvent = Date.parse(events[events.length - 1].at);
  const overlaps = t0 !== null && toVideo(lastEvent)! >= 0 && toVideo(firstEvent)! <= dur;

  function seek(seconds: number) {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, seconds);
    void v.play().catch(() => {});
  }

  function saveStart(at: number | null, source: "file" | "lineup") {
    if (!rec) return;
    setStarts((s) => ({ ...s, [rec.id]: { at, source } }));
    startSaving(async () => {
      await setRecordingStart(rec.id, at === null ? null : new Date(at).toISOString(), source);
    });
  }

  const anchor = syncs[0] ?? events.find((e) => e.kind === "open");
  const anchorLabel =
    anchor?.kind === "sync"
      ? "the sync beep (the stand flashed SYNC)"
      : `the moment "${byId.get(anchor?.score_id ?? "")?.title ?? "the first piece"}" was opened`;

  return (
    <div className="flex flex-col gap-4">
      {playable.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {playable.map((r) => (
            <button
              key={r.id}
              onClick={() => {
                setSelectedId(r.id);
                setTime(0);
                setDuration(r.duration_seconds ? Number(r.duration_seconds) : null);
              }}
              className={cx(
                "rounded-full border px-3 py-1 text-sm",
                r.id === rec?.id ? "border-accent bg-accent-soft font-semibold text-accent-ink" : "border-rule",
              )}
            >
              {r.label || r.file_name}
            </button>
          ))}
        </div>
      )}

      {rec ? (
        <div className="grid gap-3 md:grid-cols-[3fr_2fr]">
          <LessonVideo
            key={rec.id}
            ref={videoRef}
            recordingId={rec.id}
            src={rec.url!}
            streamReady={rec.streamReady}
            controls
            playsInline
            preload="metadata"
            className="aspect-video w-full rounded-2xl bg-black"
            onTimeUpdate={(e) => setTime(e.currentTarget.currentTime)}
            onLoadedMetadata={(e) => Number.isFinite(e.currentTarget.duration) && setDuration(e.currentTarget.duration)}
          />
          <div className="flex min-h-40 flex-col overflow-hidden rounded-2xl border border-rule bg-white">
            <div className="border-b border-rule bg-sheet px-3 py-1.5 text-sm">
              {t0 === null ? (
                <span className="text-muted">Line up the video to see the music follow along.</span>
              ) : nowScore ? (
                <>
                  <span className="font-semibold">{nowScore.title}</span>
                  <span className="text-muted"> · page {nowSeg?.page}</span>
                </>
              ) : (
                <span className="text-muted">No music open at this moment</span>
              )}
            </div>
            {nowPage?.url && (
              <div className="relative max-h-[60vh] overflow-y-auto">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={nowPage.url} alt="" className="w-full" />
                {marks
                  .filter((m) => m.score_id === nowSeg?.scoreId && m.page === nowSeg?.page)
                  .map((m) => (
                    <div
                      key={m.id}
                      className="absolute rounded-sm border-2 border-accent/70 bg-accent/10"
                      style={{
                        left: `${m.rect!.x * 100}%`,
                        top: `${m.rect!.y * 100}%`,
                        width: `${m.rect!.w * 100}%`,
                        height: `${m.rect!.h * 100}%`,
                      }}
                    />
                  ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted">
          Upload the lesson video above and the music stand&apos;s log will line up with it here.
        </p>
      )}

      {rec && (
        <div
          className={cx(
            "flex flex-col gap-2 rounded-xl border px-3 py-2 text-sm",
            t0 === null || !overlaps ? "border-amber/30 bg-amber-soft" : "border-rule bg-sheet",
          )}
        >
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="flex-1">
              {t0 === null
                ? "This video isn't lined up with the music stand yet."
                : !overlaps
                  ? "The video's clock and the music stand don't overlap. Line it up by hand."
                  : start?.source === "lineup"
                    ? "Lined up by hand."
                    : "Lined up from the video file's clock. Check it with the sync beep."}
            </span>
            <button onClick={() => setLineupOpen((o) => !o)} className="font-semibold text-accent-ink underline">
              {lineupOpen ? "Close" : t0 === null ? "Line it up" : "Adjust"}
            </button>
          </div>
          {lineupOpen && anchor && (
            <div className="flex flex-col gap-2 border-t border-rule/70 pt-2">
              <p>
                Play the video to {anchorLabel}, pause it right there, then press the button.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  disabled={saving}
                  onClick={() => {
                    saveStart(Date.parse(anchor.at) - time * 1000, "lineup");
                    setLineupOpen(false);
                  }}
                  className="min-h-10 rounded-xl bg-accent px-4 font-semibold text-white disabled:opacity-50"
                >
                  {anchor.kind === "sync" ? "The beep is here" : "It opened here"} ({formatClock(time)})
                </button>
                {t0 !== null && (
                  <>
                    <span className="self-center text-muted">Music changes too late/early:</span>
                    {[-5, -1, 1, 5].map((d) => (
                      <button
                        key={d}
                        disabled={saving}
                        onClick={() => saveStart(t0 - d * 1000, "lineup")}
                        className="min-h-10 rounded-xl border border-rule bg-paper px-3"
                      >
                        {d > 0 ? `+${d}` : d}s
                      </button>
                    ))}
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <div>
        <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-accent-ink">
          What was on the stand
        </div>
        <ol className="flex flex-col divide-y divide-rule rounded-2xl border border-rule bg-sheet">
          {blocks.map((b, i) => {
            const s = b.scoreId ? byId.get(b.scoreId) : undefined;
            const vStart = toVideo(b.start);
            const vEnd = b.end === null ? dur : toVideo(b.end);
            const inVideo = vStart !== null && vEnd !== null && vEnd > 0 && vStart < dur;
            const playing = !!nowSeg && b.segments.includes(nowSeg);
            const pagesSeen = [...new Set(b.segments.map((x) => x.page).filter(Boolean))];
            const wallMinutes = ((b.end ?? lastEvent) - b.start) / 60000;
            return (
              <li key={i} className={cx("flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2", playing && "bg-accent-soft")}>
                <div className="min-w-0 flex-1">
                  <div className={cx("font-medium", !s && "text-muted")}>{s ? s.title : "No music (scales, talking)"}</div>
                  <div className="text-xs text-muted">
                    {pagesSeen.length > 0 && `p. ${pagesSeen.join(", ")} · `}
                    {inVideo
                      ? `${formatClock(Math.max(0, vStart!))}–${vEnd === Infinity ? "end" : formatClock(Math.min(vEnd!, dur))}`
                      : t0 !== null
                        ? "not in this video"
                        : `${new Date(b.start).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}, about ${Math.max(1, Math.round(wallMinutes))} min`}
                  </div>
                </div>
                {inVideo && (
                  <button
                    onClick={() => seek(vStart!)}
                    className="min-h-9 rounded-lg border border-rule bg-paper px-3 text-sm font-medium text-accent-ink"
                  >
                    ▶ Play
                  </button>
                )}
              </li>
            );
          })}
        </ol>
      </div>

      {marks.length > 0 && (
        <div>
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-accent-ink">Marked bars</div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {marks.map((m) => {
              const s = byId.get(m.score_id!);
              const p = s && m.page ? s.pages[m.page - 1] : undefined;
              const v = toVideo(Date.parse(m.at));
              const inVideo = v !== null && v >= 0 && v <= dur;
              return (
                <li key={m.id} className="overflow-hidden rounded-2xl border border-rule bg-sheet">
                  {p?.url && (
                    <div
                      className="w-full bg-white"
                      style={{
                        ...cropStyle(p.url, m.rect!),
                        aspectRatio: `${m.rect!.w * p.w} / ${m.rect!.h * p.h}`,
                      }}
                      role="img"
                      aria-label={`Marked bars in ${s?.title}`}
                    />
                  )}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
                    <div className="min-w-0 flex-1">
                      {m.note && <div className="font-medium">{m.note}</div>}
                      <div className="text-xs text-muted">
                        {s?.title ?? "Removed music"}, page {m.page}
                        {inVideo ? ` · ${formatClock(v!)}` : ""}
                      </div>
                    </div>
                    {inVideo && (
                      <button
                        onClick={() => seek(v! - 8)}
                        className="min-h-9 rounded-lg border border-rule bg-paper px-3 font-medium text-accent-ink"
                      >
                        ▶ Watch
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
