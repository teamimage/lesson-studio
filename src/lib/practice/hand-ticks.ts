// Ticks on a practice day come from two places: a recorded session's review
// ticks what it heard, and the family or teacher ticks things by hand (often
// work done before the recording started, or with no recording at all).
// Both land in practice_logs.completed_assignment_ids, so "by hand" is worked
// out: what the day's log has ticked that no counted review that day heard.

import type { PracticeAnalysis } from "@/lib/practice/review-types";

type SessionLike = { analysis?: unknown; review?: PracticeAnalysis | null; counted?: boolean | null };

function analysisOf(s: SessionLike): PracticeAnalysis | null {
  return (s.review ?? (s.analysis as PracticeAnalysis | null | undefined)) ?? null;
}

/** The items one review heard clearly enough to tick. */
export function heardIds(a: PracticeAnalysis | null | undefined): string[] {
  if (!a || a.counted === false) return [];
  return (a.items ?? []).filter((i) => i.practiced && i.confidence !== "low").map((i) => i.assignment_id);
}

/** Every item any counted session that day heard. */
export function heardOnDay(sessions: SessionLike[]): Set<string> {
  const out = new Set<string>();
  for (const s of sessions) {
    if (s.counted === false) continue;
    for (const id of heardIds(analysisOf(s))) out.add(id);
  }
  return out;
}

/** The day's ticks that no recording heard: ticked by hand. */
export function handTicked(logTicks: string[] | null | undefined, sessions: SessionLike[]): string[] {
  const heard = heardOnDay(sessions);
  return (logTicks ?? []).filter((id) => !heard.has(id));
}
