import { CalendarLink } from "@/components/calendar-link";
import { Fold } from "@/components/fold";
import { Pill, SectionTitle, cx } from "@/components/ui";
import type { FeedLinks } from "@/lib/calendar-feeds";
import { formatDate, relativeDay } from "@/lib/format";
import { type Occurrence, cancelLabel, formatTime, isOn } from "@/lib/schedule";

/**
 * Home practice: the coming lessons, straight from the teacher's schedule,
 * with moves and cancellations shown, and (for the family) a link that puts
 * them in their own calendar.
 */
export function FamilyLessons({
  lessons,
  today,
  makeupsOwed,
  calendar,
}: {
  lessons: Occurrence[];
  today: string;
  makeupsOwed: number;
  /** The family's own calendar link; null for the teacher viewing this page. */
  calendar: { links: FeedLinks | null; ready: boolean; back: string } | null;
}) {
  if (lessons.length === 0 && !calendar?.links) return null;
  return (
    <section>
      <SectionTitle
        action={makeupsOwed > 0 ? <Pill tone="amber">{makeupsOwed} make-up{makeupsOwed === 1 ? "" : "s"} owed</Pill> : undefined}
      >
        Lessons
      </SectionTitle>
      {lessons.length === 0 ? (
        <p className="text-[16px] text-muted">No lessons scheduled in the next six weeks.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-rule">
          {lessons.map((o) => {
            const off = !isOn(o);
            const day = relativeDay(o.date, today);
            return (
              <li key={o.key} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                <span className={cx("min-w-[8.5rem] text-[17px] font-semibold", off && "text-muted line-through")}>
                  {day === "today" || day === "tomorrow" ? `${day[0].toUpperCase()}${day.slice(1)}` : formatDate(o.date, "weekday")}
                </span>
                <span className={cx("text-[17px] tabular-nums", off && "text-muted line-through")}>
                  {o.time ? formatTime(o.time) : ""}
                </span>
                <span className="text-sm text-muted">{o.minutes} min</span>
                {off && <Pill tone={o.kind === "noshow" ? "danger" : "muted"}>{cancelLabel(o)}</Pill>}
                {o.kind === "moved" && o.from && <Pill tone="plum">moved from {formatDate(o.from, "weekday")}</Pill>}
                {o.kind === "extra" && <Pill tone="plum">{o.makeupFor ? "make-up" : "extra lesson"}</Pill>}
                {o.note && off && <span className="w-full text-sm text-muted">{o.note}</span>}
              </li>
            );
          })}
        </ul>
      )}
      {calendar && (
        <div className="mt-2">
          <Fold title="Add lessons to my calendar" meta="Google, Outlook, Apple and others">
            <CalendarLink kind="family" links={calendar.links} ready={calendar.ready} back={calendar.back} />
          </Fold>
        </div>
      )}
    </section>
  );
}
