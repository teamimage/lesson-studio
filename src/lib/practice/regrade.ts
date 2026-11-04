import "server-only";
import type { createClient } from "@/lib/supabase/server";
import type { Json, Tables } from "@/lib/supabase/types";
import type { PracticeAnalysis } from "@/lib/ai/analyze-practice";
import { clock, parseActivity } from "./activity";
import { extractNotes, hasFineReadings } from "./notes";
import { INTONATION_VERSION, addPieceGroups, sessionIntonation } from "./intonation";
import type { SessionIntonation } from "./review-types";

type Db = Awaited<ReturnType<typeof createClient>>;
type Row = Tables<"practice_sessions">;

/**
 * Sessions reviewed before the strict intonation scale (Nov 4 2026) carry
 * the old, lenient grades. The sound timeline is still stored, so the
 * intonation part is worked out again by code (no AI) and saved the first
 * time such a session is loaded. Claude's written bullets stay as they
 * were; "Review again" rewrites those.
 */
export async function regradeIntonation<T extends Row>(db: Db, rows: T[]): Promise<T[]> {
  const stale = rows.filter((s) => {
    const i = (s.analysis as PracticeAnalysis | null)?.intonation;
    return s.status === "done" && i && (i.v ?? 1) < INTONATION_VERSION && s.activity;
  });
  if (!stale.length) return rows;

  const studentIds = [...new Set(stale.map((s) => s.student_id))];
  const { data: students } = await db.from("students").select("id, instrument").in("id", studentIds);
  const instrumentOf = new Map((students ?? []).map((s) => [s.id, s.instrument]));

  const updated = new Map<string, T>();
  for (const s of stale) {
    const instrument = instrumentOf.get(s.student_id);
    const analysis = s.analysis as PracticeAnalysis;
    const activity = parseActivity(s.activity);
    if (!instrument || !hasFineReadings(activity)) continue;
    const notes = extractNotes(activity);
    const base = sessionIntonation(notes, instrument, analysis.scales ?? []);
    let intonation: SessionIntonation | undefined;
    if (base) {
      const music = analysis.music ?? [];
      const timeline = [
        ...music.map((m) => ({ start: clock(m.start), end: clock(m.end), label: m.title })),
        ...analysis.timeline.filter((t) => !music.some((m) => t.label.toLowerCase().includes(m.title.toLowerCase()))),
      ];
      const titles = [
        ...new Set([
          ...(analysis.intonation?.groups ?? []).filter((g) => g.kind === "piece").map((g) => g.label),
          ...music.map((m) => m.title),
          ...(analysis.repertoire ?? []).map((r) => r.title),
        ]),
      ];
      intonation = addPieceGroups(base, notes, timeline, titles);
    }
    const next: PracticeAnalysis = { ...analysis, intonation };
    if (!intonation) delete next.intonation;
    // Saved when the viewer may write the row; shown either way.
    await db.from("practice_sessions").update({ analysis: next as unknown as Json }).eq("id", s.id);
    updated.set(s.id, { ...s, analysis: next as unknown as Json });
  }
  return rows.map((r) => updated.get(r.id) ?? r);
}
