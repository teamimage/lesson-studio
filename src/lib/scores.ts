import "server-only";
import { createClient } from "@/lib/supabase/server";
import { SCORES_BUCKET } from "@/lib/constants";
import { parsePages, parseRect, type StandEvent, type StandEventKind, type StandScore } from "@/lib/stand-timeline";

// A lesson's worth of viewing, so pages don't vanish mid-lesson.
const SIGNED_URL_SECONDS = 8 * 60 * 60;

/** A student's music with signed page-image URLs. Archived scores are included only when asked. */
export async function listScores(studentId: string, { includeArchived = false } = {}): Promise<StandScore[]> {
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
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    kind: r.kind,
    archived: r.archived,
    pages: r.parsed.map((p) => ({ ...p, url: urls.get(p.path) ?? null })),
  }));
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
