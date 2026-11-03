import Link from "next/link";
import { Card } from "@/components/ui";
import { periodLabel, type PeriodListItem } from "@/lib/practice/period";
import { PeriodReviewWriter } from "@/components/period-review-writer";

// Links to the practice reviews, one per stretch from one lesson to the next,
// newest first. With `writeMissing` it also quietly writes the latest finished
// period's review if it isn't written yet, so it is ready when opened.
export function PeriodReviewList({
  studentId,
  periods,
  writeMissing = false,
}: {
  studentId: string;
  periods: PeriodListItem[];
  writeMissing?: boolean;
}) {
  if (!periods.length) return null;
  const toWrite = writeMissing ? periods.find((p) => p.needsWriting) : undefined;
  return (
    <Card className="divide-y divide-rule p-0">
      {toWrite && <PeriodReviewWriter studentId={studentId} start={toWrite.start} auto quiet />}
      {periods.map((p) => (
        <Link key={p.start} href={`/family/${studentId}/review/${p.start}`} className="flex items-start gap-3 px-4 py-2.5">
          <div className="min-w-0 flex-1">
            <div className="font-medium">
              {periodLabel(p)}
              <span className="font-normal text-muted">
                {" "}
                · {p.daysPracticed} of {p.dayCount} days
                {p.totalMinutes > 0 ? ` · ${p.totalMinutes} min` : ""}
                {p.sessions > 0 ? ` · ${p.sessions} recorded` : ""}
              </span>
            </div>
            {p.encouragement && <div className="text-sm text-muted">{p.encouragement}</div>}
          </div>
          <span className="mt-0.5 text-accent-ink" aria-hidden>
            ›
          </span>
        </Link>
      ))}
    </Card>
  );
}
