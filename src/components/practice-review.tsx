import type { ReactNode } from "react";
import { cx } from "@/components/ui";
import { workOnTexts, type PracticeAnalysis } from "@/lib/practice/review-types";
import { scaleLine } from "@/lib/practice/scales";

// The body of one practice session review: check marks against the assigned
// items and current pieces, an encouraging line, "Going well" and "Things to
// work on". Shared by the Home practice page, the teacher's student page and
// the Desk.

export type CheckRow = {
  key: string;
  title: string;
  practiced: boolean;
  maybe: boolean;
  minutes: number;
  note: string;
  group: "assigned" | "current";
};

export function checklist(r: PracticeAnalysis, titles: Record<string, string>): CheckRow[] {
  const assigned: CheckRow[] = r.items.map((it) => ({
    key: it.assignment_id,
    title: titles[it.assignment_id] ?? "Assignment",
    practiced: it.practiced,
    maybe: it.practiced && it.confidence === "low",
    minutes: it.minutes,
    note: it.note,
    group: "assigned",
  }));
  const current: CheckRow[] = (r.repertoire ?? []).map((p) => ({
    key: `rep-${p.title}`,
    title: p.title,
    practiced: p.practiced,
    maybe: false,
    minutes: 0,
    note: p.note,
    group: "current",
  }));
  return [...assigned, ...current];
}

export function CheckMark({ on, className }: { on: boolean; className?: string }) {
  return (
    <span
      className={cx(
        "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs",
        on ? "bg-sage text-white" : "border border-rule",
        className,
      )}
      aria-label={on ? "practised" : "not heard"}
    >
      {on ? "✓" : ""}
    </span>
  );
}

export function PointList({
  title,
  tone,
  items,
}: {
  title: string;
  tone: "sage" | "accent";
  items: string[];
}) {
  if (!items.length) return null;
  return (
    <div className={cx("rounded-xl px-3 py-2", tone === "sage" ? "bg-sage-soft" : "bg-accent-soft")}>
      <div
        className={cx(
          "text-[12px] font-semibold uppercase tracking-[0.12em]",
          tone === "sage" ? "text-sage" : "text-accent-ink",
        )}
      >
        {title}
      </div>
      <ul className="mt-1 list-disc pl-5">
        {items.map((t, i) => (
          <li key={i}>{t}</li>
        ))}
      </ul>
    </div>
  );
}

function Label({ children }: { children: ReactNode }) {
  return <div className="text-[12px] font-semibold uppercase tracking-[0.12em] text-plum">{children}</div>;
}

export function PracticeReviewBody({
  review: r,
  titles,
  compact = false,
  teacherView = false,
}: {
  review: PracticeAnalysis;
  titles: Record<string, string>;
  compact?: boolean;
  teacherView?: boolean;
}) {
  const rows = checklist(r, titles);
  const assigned = rows.filter((c) => c.group === "assigned");
  const current = rows.filter((c) => c.group === "current");
  const goingWell = (r.going_well ?? []).map((p) => p.text);
  const workOn = workOnTexts(r);

  return (
    <>
      {r.counted === false && r.not_counted_reason && (
        <div className="rounded-xl bg-amber-soft px-3 py-2 text-sm">{r.not_counted_reason}</div>
      )}
      {r.encouragement && !compact && <div className="font-medium text-plum">{r.encouragement}</div>}

      {compact ? (
        rows.length > 0 && (
          <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-[15px]">
            {rows.map((c) => (
              <li key={c.key} className={cx("flex items-center gap-1.5", !c.practiced && "text-muted")}>
                <CheckMark on={c.practiced} className="h-4 w-4 text-[10px]" />
                {c.title}
                {c.maybe && <span className="text-muted">?</span>}
              </li>
            ))}
          </ul>
        )
      ) : (
        <>
          <CheckGroup label="Assigned" rows={assigned} showLabel={current.length > 0} />
          <CheckGroup label="Current pieces" rows={current} showLabel />
        </>
      )}

      {(r.scales?.length ?? 0) > 0 && (
        <div className={compact ? "text-sm" : undefined}>
          {!compact && <Label>Scales and arpeggios heard</Label>}
          <ul className={cx("flex flex-wrap gap-1.5", !compact && "mt-1")}>
            {compact && <li className="text-muted">Scales heard:</li>}
            {r.scales!.map((g) => (
              <li
                key={`${g.kind}-${g.key}`}
                className="rounded-full bg-sage-soft px-2.5 py-0.5 text-sm"
                title={g.off_notes.length ? `Notes outside the key: ${g.off_notes.join(", ")}` : undefined}
              >
                {scaleLine(g)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {(goingWell.length > 0 || workOn.length > 0) && (
        <div className="grid gap-2 sm:grid-cols-2">
          <PointList title="Going well" tone="sage" items={goingWell} />
          <PointList title="Things to work on" tone="accent" items={workOn} />
        </div>
      )}
      {!goingWell.length && r.flow && (
        <div>
          <Label>How it flowed</Label>
          <div>{r.flow}</div>
        </div>
      )}

      {!compact && r.other.length > 0 && (
        <div className="text-sm">
          <span className="text-muted">Also played: </span>
          {r.other.map((o) => `${o.label}${o.minutes ? ` (${Math.round(o.minutes)} min)` : ""}`).join(", ")}
        </div>
      )}
      {r.timeline.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-accent-ink">Session timeline</summary>
          <ol className="mt-1 flex flex-col gap-0.5">
            {r.timeline.map((t, i) => (
              <li key={i} className="flex gap-2">
                <span className="w-24 shrink-0 font-mono text-xs leading-5 text-muted">
                  {t.start}–{t.end}
                </span>
                <span>{t.label}</span>
              </li>
            ))}
          </ol>
        </details>
      )}
      {teacherView && r.teacher_note && (
        <div className="rounded-xl bg-accent-soft/60 px-3 py-2 text-sm">
          <span className="font-medium text-accent-ink">Teacher only: </span>
          {r.teacher_note}
        </div>
      )}
    </>
  );
}

function CheckGroup({ label, rows, showLabel }: { label: string; rows: CheckRow[]; showLabel: boolean }) {
  if (!rows.length) return null;
  return (
    <div>
      {showLabel && <Label>{label}</Label>}
      <ul className="mt-1 flex flex-col gap-1.5">
        {rows.map((c) => (
          <li key={c.key} className="flex items-start gap-2">
            <CheckMark on={c.practiced} className="mt-0.5" />
            <span className="min-w-0 flex-1">
              <span className="font-medium">{c.title}</span>
              {c.practiced && c.minutes > 0 && <span className="text-muted"> · {Math.round(c.minutes)} min</span>}
              {c.maybe && <span className="text-muted"> · maybe</span>}
              {c.note && <span className="text-sm text-muted"> · {c.note}</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
