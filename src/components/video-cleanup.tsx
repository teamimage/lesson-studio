"use client";

import { useMemo, useState } from "react";
import { adminPurgeVideos } from "@/app/admin/actions";
import { formatBytes } from "@/lib/format";
import { Button, Pill } from "@/components/ui";

export type CleanupVideo = {
  /** recording id, or the storage path for a file whose lesson is gone */
  key: string;
  kind: "recording" | "loose";
  name: string;
  student: string | null;
  lessonDate: string | null;
  bytes: number;
  state: "archived" | "active" | "loose";
  /** sortable date: lesson date, else upload date (YYYY-MM-DD) */
  date: string;
};

const STATE_LABEL = { archived: "Deleted from lesson", active: "On lesson", loose: "No lesson" } as const;
const STATE_TONE = { archived: "amber", active: "sage", loose: "plum" } as const;

/**
 * Pick lesson videos to delete for good, oldest first. Shows how much space
 * the selection frees and asks before deleting.
 */
export function VideoCleanup({ videos }: { videos: CleanupVideo[] }) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [months, setMonths] = useState("6");
  const sorted = useMemo(() => [...videos].sort((a, b) => a.date.localeCompare(b.date)), [videos]);
  const chosen = sorted.filter((v) => picked.has(v.key));
  const bytes = chosen.reduce((n, v) => n + v.bytes, 0);

  const toggle = (key: string) =>
    setPicked((p) => {
      const next = new Set(p);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const select = (pred: (v: CleanupVideo) => boolean) => setPicked(new Set(sorted.filter(pred).map((v) => v.key)));
  const olderThan = () => {
    const d = new Date();
    d.setMonth(d.getMonth() - Number(months));
    const cutoff = d.toISOString().slice(0, 10);
    select((v) => v.date < cutoff);
  };

  if (sorted.length === 0) return <p className="text-sm text-muted">No lesson videos stored.</p>;

  return (
    <form action={adminPurgeVideos} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted">Select:</span>
        <button type="button" className="text-accent-ink underline" onClick={() => select((v) => v.state !== "active")}>
          Deleted and no lesson
        </button>
        <span className="text-muted">·</span>
        <span className="flex items-center gap-1">
          <button type="button" className="text-accent-ink underline" onClick={olderThan}>
            Older than
          </button>
          <select
            value={months}
            onChange={(e) => setMonths(e.target.value)}
            className="rounded-md border border-rule bg-sheet px-1 py-0.5"
            aria-label="Months"
          >
            {["1", "3", "6", "12", "24"].map((m) => (
              <option key={m} value={m}>
                {m} month{m === "1" ? "" : "s"}
              </option>
            ))}
          </select>
        </span>
        <span className="text-muted">·</span>
        <button type="button" className="text-accent-ink underline" onClick={() => select(() => true)}>
          All
        </button>
        <span className="text-muted">·</span>
        <button type="button" className="text-accent-ink underline" onClick={() => setPicked(new Set())}>
          None
        </button>
      </div>

      <ul className="divide-y divide-rule overflow-hidden rounded-2xl border border-rule bg-sheet">
        {sorted.map((v) => (
          <li key={v.key}>
            <label className="flex cursor-pointer items-start gap-3 px-3 py-2.5 text-sm hover:bg-paper">
              <input
                type="checkbox"
                name={v.kind === "recording" ? "recording_id" : "path"}
                value={v.key}
                checked={picked.has(v.key)}
                onChange={() => toggle(v.key)}
                className="mt-1 size-4 accent-accent"
              />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="break-all font-medium">{v.name}</span>
                  <Pill tone={STATE_TONE[v.state]}>{STATE_LABEL[v.state]}</Pill>
                </span>
                <span className="block text-muted">
                  {[v.student, v.lessonDate ? `lesson ${v.lessonDate}` : `uploaded ${v.date}`, formatBytes(v.bytes)]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
            </label>
          </li>
        ))}
      </ul>

      <div className="sticky bottom-3 flex flex-wrap items-center gap-3 rounded-2xl border border-rule bg-sheet px-4 py-3 shadow-sm">
        <span className="flex-1 text-sm">
          {chosen.length === 0
            ? "Nothing selected."
            : `${chosen.length} video${chosen.length === 1 ? "" : "s"} selected · frees ${formatBytes(bytes)}`}
        </span>
        <Button
          variant="danger"
          className="min-h-9 px-3 text-sm"
          disabled={chosen.length === 0}
          onClick={(e) => {
            const onLesson = chosen.filter((v) => v.state === "active").length;
            const msg =
              `Delete ${chosen.length} video${chosen.length === 1 ? "" : "s"} (${formatBytes(bytes)}) for good?\n\n` +
              "The original files, streaming copies and transcripts are removed. This can't be undone." +
              (onLesson
                ? `\n\n${onLesson} of them ${onLesson === 1 ? "is" : "are"} still on a lesson and will disappear from it. The written lesson notes stay.`
                : "");
            if (!window.confirm(msg)) e.preventDefault();
          }}
        >
          Delete for good
        </Button>
      </div>
    </form>
  );
}
