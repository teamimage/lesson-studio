import "server-only";
import { createClient } from "@/lib/supabase/server";
import { SCORES_BUCKET } from "@/lib/constants";
import { isPending, parseAnalysis, type AnalysisStatus } from "@/lib/score-analysis";
import { parseBarMap } from "@/lib/bar-map";
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
  { includeArchived = false, withSourceLinks = false, withOriginals = false, includePending = false } = {},
): Promise<StandScore[]> {
  const supabase = await createClient();
  let query = supabase.from("scores").select("*").eq("student_id", studentId);
  if (!includeArchived) query = query.eq("archived", false);
  const { data } = await query.order("sort_order").order("created_at");
  // Uploads still waiting for the teacher's check stay out of everything but the music library.
  const rows = (data ?? []).filter((r) => includePending || !isPending(r.analysis)).map((r) => ({ ...r, parsed: parsePages(r.pages), barMap: parseBarMap(r.pages) }));
  // The photos behind digitized pages are only signed when asked for ("Show original pictures").
  const paths = rows.flatMap((r) =>
    r.parsed.flatMap((p) => (withOriginals && p.original ? [p.path, p.original.path] : [p.path])),
  );
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
      pages: r.parsed.map((p, i) => ({
        ...p,
        url: urls.get(p.path) ?? null,
        ...(withOriginals ? { originalUrl: p.original ? (urls.get(p.original.path) ?? null) : (urls.get(p.path) ?? null) } : {}),
        bars: r.barMap[i] ?? null,
      })),
      sections: analysis?.sections ?? [],
      analysis,
      analysisStatus: status,
      analysisError,
      source: r.source_path
        ? { name: r.source_name || "Original file", size: r.source_size, url: sourceUrls.get(r.id) ?? null }
        : null,
      rights: r.rights_confirmed_at
        ? { at: r.rights_confirmed_at, email: r.rights_confirmed_email, version: r.rights_version }
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

/** A light list of a student's music (no page links), for linking to the viewer. */
export async function listScoreIndex(studentId: string): Promise<
  {
    id: string;
    title: string;
    book: string;
    sections: StandScore["sections"];
    pageCount: number;
  }[]
> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("scores")
    .select("id, title, analysis, pages, archived")
    .eq("student_id", studentId)
    .eq("archived", false)
    .order("sort_order")
    .order("created_at");
  return (data ?? []).filter((r) => !isPending(r.analysis)).map((r) => {
    const a = parseAnalysis(r.analysis);
    return {
      id: r.id,
      title: r.title,
      book: a?.book ?? "",
      sections: a?.sections ?? [],
      pageCount: parsePages(r.pages).length,
    };
  });
}
