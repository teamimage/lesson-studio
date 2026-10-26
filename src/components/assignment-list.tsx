import type { Assignment } from "@/lib/data";
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

export function AssignmentList({
  assignments,
  className,
}: {
  assignments: Assignment[];
  className?: string;
}) {
  return (
    <ol className={cx("flex flex-col gap-2", className)}>
      {assignments.map((a, i) => (
        <li key={a.id} className="flex gap-3 rounded-2xl border border-rule bg-sheet p-3">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-sm font-semibold text-accent-ink">
            {i + 1}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-medium">{a.title}</span>
              <Pill tone={KIND_TONE[a.kind]}>{a.kind}</Pill>
              {!a.every_day && <Pill>not daily</Pill>}
            </div>
            {a.how && <div className="mt-0.5 text-sm text-muted">{a.how}</div>}
          </div>
        </li>
      ))}
    </ol>
  );
}
