import Link from "next/link";
import { Card } from "@/components/ui";
import { weekLabel, type WeekListItem } from "@/lib/practice/week";
import { WeekReviewWriter } from "@/components/week-review-writer";

// Links to the weekly practice reviews, newest first. On the Home practice
// page it also quietly writes last week's review if it isn't written yet, so
// it is ready when the family opens it.
export function WeeklyReviewList({
  studentId,
  weeks,
  writeMissing = false,
}: {
  studentId: string;
  weeks: WeekListItem[];
  writeMissing?: boolean;
}) {
  if (!weeks.length) return null;
  const toWrite = writeMissing ? weeks.find((w) => w.needsWriting) : undefined;
  return (
    <Card className="divide-y divide-rule p-0">
      {toWrite && <WeekReviewWriter studentId={studentId} weekStart={toWrite.start} auto quiet />}
      {weeks.map((w) => (
        <Link key={w.start} href={`/family/${studentId}/week/${w.start}`} className="flex items-start gap-3 px-4 py-2.5">
          <div className="min-w-0 flex-1">
            <div className="font-medium">
              {w.isCurrent ? "This week" : weekLabel(w.start)}
              <span className="font-normal text-muted">
                {" "}
                · {w.daysPracticed} {w.daysPracticed === 1 ? "day" : "days"}
                {w.totalMinutes > 0 ? ` · ${w.totalMinutes} min` : ""}
                {w.sessions > 0 ? ` · ${w.sessions} recorded` : ""}
              </span>
            </div>
            {w.encouragement && <div className="text-sm text-muted">{w.encouragement}</div>}
          </div>
          <span className="mt-0.5 text-accent-ink" aria-hidden>
            ›
          </span>
        </Link>
      ))}
    </Card>
  );
}
