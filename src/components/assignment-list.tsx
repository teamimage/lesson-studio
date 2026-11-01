import type { Assignment } from "@/lib/data";
import { formatClock, type Jump } from "@/lib/lesson-moments";
import { JumpButton } from "./video-popup";
import { Pill, cx } from "./ui";

const KIND_TONE: Record<Assignment["kind"], "accent" | "sage" | "plum" | "amber" | "muted"> = {
  piece: "accent",
  review: "sage",
  technique: "amber",
  game: "amber",
  listening: "plum",
  theory: "muted",
  other: "muted",
};

/**
 * Practice assignments as one-line rows. Tapping a row opens the full
 * instructions. When the assignment was worked on in the lesson video, a
 * "▶ 4:10" button opens the popup player at that spot (lesson page only).
 */
export function AssignmentList({
  assignments,
  jumps,
  className,
}: {
  assignments: Assignment[];
  jumps?: Record<string, Jump>;
  className?: string;
}) {
  return (
    <ol
      className={cx("flex flex-col divide-y divide-rule overflow-hidden rounded-2xl border border-rule bg-sheet", className)}
    >
      {assignments.map((a, i) => {
        const jump = jumps?.[a.id];
        return (
          <li key={a.id}>
            <details className="group">
              <summary className="flex cursor-pointer list-none items-center gap-2.5 px-3 py-2 text-sm [&::-webkit-details-marker]:hidden">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent-ink">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-medium">{a.title}</span>
                  {a.how && <span className="text-muted group-open:hidden"> · {a.how}</span>}
                </span>
                {jump && <JumpButton jump={jump} />}
                <span className="shrink-0 text-xs text-muted transition-transform group-open:rotate-90" aria-hidden>
                  ›
                </span>
              </summary>
              <div className="flex flex-col gap-1.5 pr-3 pb-3 pl-[2.95rem] text-sm">
                {a.how && <p className="whitespace-pre-line">{a.how}</p>}
                <div className="flex flex-wrap items-center gap-1.5">
                  <Pill tone={KIND_TONE[a.kind]}>{a.kind}</Pill>
                  <Pill>{a.every_day ? "every day" : "not daily"}</Pill>
                  {jump && (
                    <JumpButton jump={jump} className="font-medium">
                      ▶ Watch this in the lesson ({formatClock(jump.seconds)})
                    </JumpButton>
                  )}
                </div>
              </div>
            </details>
          </li>
        );
      })}
    </ol>
  );
}
