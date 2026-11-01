"use client";

import { useState } from "react";
import { cx } from "@/components/ui";
import { JumpButton, useVideoPopup } from "@/components/video-popup";
import { formatClock, type Moment, type MomentKind } from "@/lib/lesson-moments";

const TABS: { key: "all" | MomentKind; label: string }[] = [
  { key: "all", label: "All" },
  { key: "piece", label: "Pieces" },
  { key: "mark", label: "Marked bars" },
  { key: "ai", label: "AI notes" },
];

const TAG: Record<MomentKind, { text: string; className: string }> = {
  piece: { text: "Piece", className: "bg-accent-soft text-accent-ink" },
  mark: { text: "Bars", className: "bg-amber-soft text-amber" },
  ai: { text: "AI", className: "bg-plum-soft text-plum" },
};

/**
 * Lesson review: one compact row per synced moment of the lesson (pieces and
 * page turns from the music stand, marked bars, moments the AI found in the
 * transcript). Tapping a row opens the popup player at that moment.
 */
export function LessonReview({ moments, multiVideo }: { moments: Moment[]; multiVideo?: Record<string, string> }) {
  const [tab, setTab] = useState<"all" | MomentKind>("all");
  const popup = useVideoPopup();
  const counts = { all: moments.length, piece: 0, mark: 0, ai: 0 } as Record<"all" | MomentKind, number>;
  for (const m of moments) counts[m.kind]++;
  const tabs = TABS.filter((t) => t.key === "all" || counts[t.key] > 0);
  const shown = tab === "all" ? moments : moments.filter((m) => m.kind === tab);

  return (
    <div className="flex flex-col gap-2">
      {tabs.length > 2 && (
        <div className="flex flex-wrap gap-1.5" role="tablist">
          {tabs.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={cx(
                "rounded-full border px-2.5 py-0.5 text-xs",
                tab === t.key ? "border-accent bg-accent-soft font-semibold text-accent-ink" : "border-rule text-muted",
              )}
            >
              {t.label} <span className="tabular-nums opacity-70">{counts[t.key]}</span>
            </button>
          ))}
        </div>
      )}
      <ol className="flex flex-col divide-y divide-rule overflow-hidden rounded-2xl border border-rule bg-sheet">
        {shown.map((m) => (
          <li key={m.id}>
            <button
              type="button"
              onClick={() => popup?.open(m)}
              className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm hover:bg-accent-soft/50"
            >
              <span className="w-12 shrink-0 text-xs font-semibold tabular-nums text-accent-ink">
                ▶ {formatClock(m.seconds)}
              </span>
              <span
                className={cx(
                  "w-10 shrink-0 rounded px-1 text-center text-[10px] font-semibold uppercase tracking-wide",
                  TAG[m.kind].className,
                )}
              >
                {TAG[m.kind].text}
              </span>
              <span className="min-w-0 flex-1 truncate">
                <span className="font-medium">{m.label}</span>
                {(m.detail || multiVideo?.[m.recordingId]) && (
                  <span className="text-muted">
                    {" "}
                    · {[m.detail, multiVideo?.[m.recordingId]].filter(Boolean).join(" · ")}
                  </span>
                )}
              </span>
            </button>
            {m.pages && (
              <div className="-mt-0.5 flex flex-wrap gap-1 pb-1.5 pl-[5.9rem] pr-3">
                {m.pages.map((p) => (
                  <JumpButton
                    key={`${p.page}-${p.seconds}`}
                    jump={{
                      recordingId: m.recordingId,
                      seconds: p.seconds,
                      label: `${m.label}, page ${p.page}`,
                    }}
                    className="min-h-6 px-1.5 font-medium"
                  >
                    p.{p.page} <span className="text-muted">{formatClock(p.seconds)}</span>
                  </JumpButton>
                ))}
              </div>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
