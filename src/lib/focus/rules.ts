import { STUCK_AT, type FocusEventRow, type FocusItem, type FocusItemRow, type FocusStatus } from "./types";

// The rules that turn a focus point's events into the one word on the list.
// Pure functions, so the same rules run for the family's card, the
// teacher's card and the practice review.
//
// - A lesson sets the status outright: the teacher heard it.
// - One practice never moves it. Two practices in a row that agree do
//   (a single day is noise: 12 minutes one day, 32 the next).
// - A practice where the point wasn't heard says nothing either way.

const UP = new Set(["better", "first_time"]);

export function statusOf(events: FocusEventRow[]): { status: FocusStatus; sameRun: number; lastNote: string; lastHeardOn: string | null } {
  const sorted = [...events].sort((a, b) => (a.event_date + a.created_at).localeCompare(b.event_date + b.created_at));
  let status: FocusStatus = "working";
  let sameRun = 0;
  let lastNote = "";
  let lastHeardOn: string | null = null;
  let previous: "up" | "down" | "same" | null = null;
  let held = 0;
  for (const e of sorted) {
    if (e.verdict === "not_heard" || e.verdict === "not_mentioned") continue;
    if (e.note) lastNote = e.note;
    lastHeardOn = e.event_date;
    if (e.source === "lesson" || e.source === "teacher") {
      status = e.verdict === "done" ? "done" : UP.has(e.verdict) ? "better" : e.verdict === "went_back" ? "went_back" : "working";
      sameRun = 0;
      held = 0;
      previous = null;
      continue;
    }
    if (e.source !== "practice") continue;
    const now = UP.has(e.verdict) ? "up" : e.verdict === "went_back" ? "down" : "same";
    if (now === "up") {
      // One good day is held back: it only clears the count once the next
      // practice agrees. If the next one doesn't, it counts as no change.
      if (previous === "up") {
        sameRun = 0;
        held = 0;
      } else held = 1;
    } else {
      sameRun += 1 + held;
      held = 0;
    }
    if (previous === now) {
      if (now === "up") status = "better";
      else if (now === "down") status = "went_back";
    }
    previous = now;
  }
  return { status, sameRun, lastNote, lastHeardOn };
}

export function withStatus(item: FocusItemRow, events: FocusEventRow[]): FocusItem {
  const s = statusOf(events.filter((e) => e.focus_item_id === item.id));
  return { ...item, ...s, stuck: s.sameRun >= STUCK_AT };
}

/** Lessons in a row, newest back, that didn't mention the point. */
export function unmentionedRun(events: FocusEventRow[]): number {
  const lessons = events
    .filter((e) => e.source === "lesson")
    .sort((a, b) => (b.event_date + b.created_at).localeCompare(a.event_date + a.created_at));
  let n = 0;
  for (const e of lessons) {
    if (e.verdict !== "not_mentioned") break;
    n += 1;
  }
  return n;
}
