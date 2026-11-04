import { addDays, parseISODate, toISODate } from "@/lib/format";

// Month pages for the practice calendar. A month is "YYYY-MM"; its grid runs
// Sunday to Saturday and starts on the Sunday on or before the 1st, so it
// shows a few days of the months either side.

export function monthOf(iso: string): string {
  return iso.slice(0, 7);
}

export function shiftMonth(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  return toISODate(new Date(y, m - 1 + n, 1)).slice(0, 7);
}

/** The weeks shown for a month, each seven ISO dates from Sunday. */
export function monthWeeks(month: string): string[][] {
  const first = `${month}-01`;
  const start = addDays(first, -parseISODate(first).getDay());
  const weeks: string[][] = [];
  for (let w = 0; w < 6; w++) {
    const week = Array.from({ length: 7 }, (_, d) => addDays(start, w * 7 + d));
    if (w > 0 && monthOf(week[0]) !== month) break;
    weeks.push(week);
  }
  return weeks;
}

/** First and last date of a month's grid, for loading its practice. */
export function monthRange(month: string): [string, string] {
  const weeks = monthWeeks(month);
  return [weeks[0][0], weeks[weeks.length - 1][6]];
}

export function monthLabel(month: string): string {
  return parseISODate(`${month}-01`).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}
