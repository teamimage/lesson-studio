import type { PracticeDay } from "./data";

/** Sessions shown on a calendar that are waiting on the review steps. */
export function pendingSessionIds(days: Record<string, PracticeDay> | undefined): string[] {
  if (!days) return [];
  return Object.values(days)
    .flatMap((d) => d.sessions)
    .filter((s) => s.status === "transcribing" || s.status === "analyzing")
    .map((s) => s.id)
    .sort();
}
