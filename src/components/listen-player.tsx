"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { recordListen } from "@/app/students/reference-actions";
import { formatDuration, trackLabel, type ListenTrack } from "@/lib/reference-recordings";
import { cx } from "@/components/ui";

// Share of the track that must actually be heard (not skipped) for a play to count.
const HEARD_SHARE = 0.8;

/**
 * Player for an assigned reference recording on Home practice. A play counts
 * when the track ends after most of it was heard; reaching the teacher's
 * number of plays ticks the practice item off for that day.
 */
export function ListenPlayer({
  track,
  assignmentId,
  studentId,
  date,
  times,
  initialPlays,
}: {
  track: ListenTrack;
  assignmentId: string;
  studentId: string;
  date: string;
  times: number;
  initialPlays: number;
}) {
  const router = useRouter();
  const heard = useRef(0);
  const last = useRef<number | null>(null);
  const [plays, setPlays] = useState(initialPlays);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const done = plays >= times;

  async function countPlay() {
    setSaving(true);
    const res = await recordListen({ studentId, date, assignmentId });
    setSaving(false);
    if ("error" in res) return setError(res.error);
    setError(null);
    setPlays(res.plays);
    router.refresh();
  }

  const status = (
    <span className={cx("text-sm", done ? "font-medium text-sage" : "text-muted")}>
      {done ? "✓ " : ""}
      Played {Math.min(plays, 99)} of {times} time{times === 1 ? "" : "s"}
      {saving ? " · saving…" : ""}
    </span>
  );

  if (!track.url) {
    return track.link_url ? (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <a href={track.link_url} target="_blank" rel="noreferrer" className="text-sm font-medium text-plum underline">
          ▶ Open {trackLabel(track)} ↗
        </a>
        <span className="text-sm text-muted">Tick the box once you&apos;ve listened.</span>
      </div>
    ) : null;
  }

  return (
    <div className="flex flex-col gap-1">
      <audio
        controls
        preload="metadata"
        src={track.url}
        className="h-10 w-full"
        onPlay={(e) => {
          last.current = e.currentTarget.currentTime;
        }}
        onTimeUpdate={(e) => {
          const t = e.currentTarget.currentTime;
          // Only small forward steps are listening; a jump is a skip.
          if (last.current !== null && t > last.current && t - last.current < 1.5) heard.current += t - last.current;
          last.current = t;
        }}
        onSeeked={(e) => {
          last.current = e.currentTarget.currentTime;
        }}
        onEnded={(e) => {
          const length = e.currentTarget.duration || track.duration_seconds || 0;
          const enough = !length || heard.current >= length * HEARD_SHARE;
          heard.current = 0;
          last.current = null;
          if (enough) void countPlay();
          else setError("That play skipped too much to count. Listen through to the end.");
        }}
      />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-xs text-muted">
          {trackLabel(track)}
          {track.duration_seconds ? ` · ${formatDuration(track.duration_seconds)}` : ""}
        </span>
        <span className="ml-auto">{status}</span>
      </div>
      {error && <span className="text-sm text-danger">{error}</span>}
    </div>
  );
}
