// iCalendar (.ics) text for calendar subscription links and "Add to my
// calendar". Every lesson is its own event with times in UTC, so Google,
// Outlook, Apple and others all show it at the right local time without
// needing time zone tables. Recurring lessons are written out one by one
// (rather than as a repeat rule) so cancellations and moves come through
// exactly.

import { type Occurrence, zonedToUtc } from "@/lib/schedule";
import { formatDate } from "@/lib/format";

export type IcsEvent = {
  uid: string;
  occ: Occurrence;
  timeZone: string;
  summary: string;
  description?: string;
  url?: string;
};

function esc(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/([,;])/g, "\\$1");
}

/** Lines longer than 75 bytes continue on the next line after a space. */
function fold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let cur = "";
  let curLen = 0;
  for (const ch of line) {
    const n = new TextEncoder().encode(ch).length;
    if (curLen + n > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = "";
      curLen = 0;
    }
    cur += ch;
    curLen += n;
  }
  out.push(cur);
  return out.join("\r\n ");
}

function utcStamp(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function eventLines(e: IcsEvent, stamp: string): string[] {
  const o = e.occ;
  const cancelled = o.kind === "cancelled";
  const lines = ["BEGIN:VEVENT", `UID:${e.uid}`, `DTSTAMP:${stamp}`];
  if (o.time) {
    const start = zonedToUtc(o.date, o.time, e.timeZone);
    const end = new Date(start.getTime() + o.minutes * 60_000);
    lines.push(`DTSTART:${utcStamp(start)}`, `DTEND:${utcStamp(end)}`);
  } else {
    const d = o.date.replace(/-/g, "");
    lines.push(`DTSTART;VALUE=DATE:${d}`);
  }
  lines.push(`SUMMARY:${esc(cancelled ? `Cancelled: ${e.summary}` : e.summary)}`);
  const notes: string[] = [];
  if (o.kind === "moved" && o.from) notes.push(`Moved from ${formatDate(o.from, "weekday")}.`);
  if (o.kind === "extra") notes.push(o.makeupFor ? "Make-up lesson." : "One-off lesson.");
  if (cancelled) notes.push(o.cancelledBy === "studio" ? "Studio closed." : "This lesson is cancelled.");
  if (o.note) notes.push(o.note);
  if (e.description) notes.push(e.description);
  if (notes.length) lines.push(`DESCRIPTION:${esc(notes.join("\n"))}`);
  if (e.url) lines.push(`URL:${e.url}`);
  lines.push(`STATUS:${cancelled ? "CANCELLED" : "CONFIRMED"}`, "TRANSP:OPAQUE", "END:VEVENT");
  return lines;
}

/** A whole calendar: a subscription feed, or a single lesson. */
export function buildCalendar(name: string, events: IcsEvent[]): string {
  const stamp = utcStamp(new Date());
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Lesson Studio//Lessons//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${esc(name)}`,
    // Ask calendar apps to check hourly. Apple honours this; Google and
    // Outlook decide for themselves.
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
    ...events.flatMap((e) => eventLines(e, stamp)),
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}
