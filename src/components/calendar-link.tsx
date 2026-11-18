import { makeCalendarLink, stopCalendarLink } from "@/app/calendar-actions";
import { type FeedKind, type FeedLinks } from "@/lib/calendar-feeds";
import { CopyLink } from "./copy-link";
import { Button } from "./ui";

/**
 * Your calendar subscription link: lessons show in Google Calendar, Outlook,
 * Apple Calendar or any other calendar app and stay up to date there. One
 * button per common app, plus the plain link to copy for the rest.
 */
export function CalendarLink({
  kind,
  links,
  ready,
  back,
}: {
  kind: FeedKind;
  links: FeedLinks | null;
  /** False until schedule-foundation.sql has run. */
  ready: boolean;
  /** Page to refresh after a change. */
  back: string;
}) {
  if (!ready) {
    return <p className="text-[16px] text-muted">Calendar links switch on once schedule-foundation.sql has been run.</p>;
  }
  if (!links) {
    return (
      <form action={makeCalendarLink} className="flex flex-col gap-2">
        <input type="hidden" name="kind" value={kind} />
        <input type="hidden" name="back" value={back} />
        <p className="text-[16px] text-muted">
          {kind === "teacher"
            ? "See every lesson in Google Calendar, Outlook, Apple Calendar or any calendar app. Moves and cancellations follow."
            : "See lessons in your own calendar (Google, Outlook, Apple or any other). Moves and cancellations follow."}
        </p>
        <Button className="self-start">Make my calendar link</Button>
      </form>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <a href={links.webcal} className="inline-flex min-h-11 items-center rounded-xl bg-accent px-4 text-[16px] font-semibold text-white no-underline">
          iPhone, iPad or Mac
        </a>
        <a
          href={links.google}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-11 items-center rounded-xl border border-rule bg-sheet px-4 text-[16px] font-semibold text-ink no-underline"
        >
          Google Calendar
        </a>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-sm text-muted">Outlook and others: copy this and use &ldquo;Subscribe from web&rdquo; or &ldquo;Add calendar from URL&rdquo;.</span>
        <CopyLink url={links.https} label="Calendar link" />
      </div>
      <p className="text-sm text-muted">
        Apple Calendar checks for changes about every 15 minutes, Outlook every few hours, and Google Calendar only every
        12 to 24 hours. Tell the family about a change on the same day. Anyone with this link can see the lesson times, so
        share it only with family.
      </p>
      <div className="flex flex-wrap gap-4">
        <form action={makeCalendarLink}>
          <input type="hidden" name="kind" value={kind} />
          <input type="hidden" name="back" value={back} />
          <input type="hidden" name="reset" value="1" />
          <button className="min-h-9 text-sm font-medium text-accent-ink underline">Make a new link (the old one stops working)</button>
        </form>
        <form action={stopCalendarLink}>
          <input type="hidden" name="kind" value={kind} />
          <input type="hidden" name="back" value={back} />
          <button className="min-h-9 text-sm font-medium text-danger underline">Turn the link off</button>
        </form>
      </div>
    </div>
  );
}
