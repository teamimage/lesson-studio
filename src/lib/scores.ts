import "server-only";
import { createClient } from "@/lib/supabase/server";
import { SCORES_BUCKET } from "@/lib/constants";
import { parseAnalysis, type AnalysisStatus } from "@/lib/score-analysis";
import { parsePages, parseRect, type StandEvent, type StandEventKind, type StandScore } from "@/lib/stand-timeline";

// A lesson's worth of viewing, so pages don't vanish mid-lesson.
const SIGNED_URL_SECONDS = 8 * 60 * 60;

// A run that hasn't finished by now died with its function (matches read-music).
const READ_STALE_MS = 6 * 60 * 1000;

/**
 * A student's music with signed page-image URLs. Archived scores are included
 * only when asked; download links for the original files only when asked.
 */
export async function listScores(
  studentId: string,
  { includeArchived = false, withSourceLinks = false } = {},
): Promise<StandScore[]> {
  const supabase = await createClient();
  let query = supabase.from("scores").select("*").eq("student_id", studentId);
  if (!includeArchived) query = query.eq("archived", false);
  const { data } = await query.order("sort_order").order("created_at");
  const rows = (data ?? []).map((r) => ({ ...r, parsed: parsePages(r.pages) }));
  const paths = rows.flatMap((r) => r.parsed.map((p) => p.path));
  const urls = new Map<string, string>();
  if (paths.length > 0) {
    const { data: signed } = await supabase.storage.from(SCORES_BUCKET).createSignedUrls(paths, SIGNED_URL_SECONDS);
    for (const s of signed ?? []) if (s.path && s.signedUrl) urls.set(s.path, s.signedUrl);
  }
  const sourceUrls = new Map<string, string>();
  if (withSourceLinks) {
    await Promise.all(
      rows
        .filter((r) => r.source_path)
        .map(async (r) => {
          const { data: s } = await supabase.storage
            .from(SCORES_BUCKET)
            .createSignedUrl(r.source_path!, SIGNED_URL_SECONDS, { download: r.source_name || true });
          if (s?.signedUrl) sourceUrls.set(r.id, s.signedUrl);
        }),
    );
  }
  const staleBefore = Date.now() - READ_STALE_MS;
  return rows.map((r) => {
    const analysis = parseAnalysis(r.analysis);
    let status = r.analysis_status as AnalysisStatus;
    let analysisError = r.analysis_error;
    if (status === "running" && r.analysis_at && Date.parse(r.analysis_at) < staleBefore) {
      status = "error";
      analysisError = "Reading the music stopped part way. Press Read again.";
    }
    return {
      id: r.id,
      title: r.title,
      kind: r.kind,
      archived: r.archived,
      pages: r.parsed.map((p) => ({ ...p, url: urls.get(p.path) ?? null })),
      sections: analysis?.sections ?? [],
      analysis,
      analysisStatus: status,
      analysisError,
      source: r.source_path
        ? { name: r.source_name || "Original file", size: r.source_size, url: sourceUrls.get(r.id) ?? null }
        : null,
    };
  });
}

export async function listStandEvents(lessonId: string): Promise<StandEvent[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("stand_events").select("*").eq("lesson_id", lessonId).order("at");
  return (data ?? []).map((e) => ({
    id: e.id,
    kind: e.kind as StandEventKind,
    score_id: e.score_id,
    page: e.page,
    rect: parseRect(e.rect),
    note: e.note,
    at: e.at,
  }));
}
