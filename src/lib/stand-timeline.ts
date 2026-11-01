// Shared (client + server) helpers for the music stand: page shapes, and
// turning the stand's log of page turns into a timeline on a lesson video.

import type { Json } from "@/lib/supabase/types";
import type { AnalysisStatus, ScoreAnalysis, ScoreSection } from "@/lib/score-analysis";

export type ScorePage = { path: string; w: number; h: number };
/** A score page with a signed image URL. */
export type ScorePageWithUrl = ScorePage & { url: string | null };
export type StandScore = {
  id: string;
  title: string;
  kind: string;
  archived: boolean;
  pages: ScorePageWithUrl[];
  /** Pieces and movements Claude found, with page ranges ([] if none yet). */
  sections: ScoreSection[];
  analysis: ScoreAnalysis | null;
  analysisStatus: AnalysisStatus;
  analysisError: string | null;
  /** The file as uploaded (PDFs), with a download link when asked for. */
  source: { name: string; size: number | null; url: string | null } | null;
};
export type Rect = { x: number; y: number; w: number; h: number };
export type StandEventKind = "open" | "close" | "sync" | "mark" | "end";
export type StandEvent = {
  id: string;
  kind: StandEventKind;
  score_id: string | null;
  page: number | null;
  rect: Rect | null;
  note: string | null;
  at: string; // ISO time
};

export function parsePages(json: Json): ScorePage[] {
  if (!Array.isArray(json)) return [];
  return json.flatMap((p) => {
    if (!p || typeof p !== "object" || Array.isArray(p)) return [];
    const { path, w, h } = p as Record<string, unknown>;
    if (typeof path !== "string") return [];
    return [{ path, w: Number(w) || 1000, h: Number(h) || 1400 }];
  });
}

export function parseRect(json: Json | null): Rect | null {
  if (!json || typeof json !== "object" || Array.isArray(json)) return null;
  const { x, y, w, h } = json as Record<string, unknown>;
  const n = [x, y, w, h].map(Number);
  if (n.some((v) => !Number.isFinite(v))) return null;
  return { x: n[0], y: n[1], w: n[2], h: n[3] };
}

/** One stretch of time with one page open (score null = no music on the stand). */
export type Segment = { scoreId: string | null; page: number | null; start: number; end: number | null };
/** Consecutive segments on the same score. */
export type Block = { scoreId: string | null; start: number; end: number | null; segments: Segment[] };

/** Segments in wall-clock milliseconds, from open/close/end events. */
export function buildSegments(events: StandEvent[]): Segment[] {
  const sorted = events
    .filter((e) => e.kind === "open" || e.kind === "close" || e.kind === "end")
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  const out: Segment[] = [];
  for (const e of sorted) {
    const t = Date.parse(e.at);
    const last = out[out.length - 1];
    if (last && last.end === null) last.end = t;
    if (e.kind === "open") {
      // Re-opening the page that is already open adds nothing.
      if (last && last.end === t && last.scoreId === e.score_id && last.page === e.page) {
        last.end = null;
        continue;
      }
      out.push({ scoreId: e.score_id, page: e.page, start: t, end: null });
    } else if (e.kind === "close") {
      out.push({ scoreId: null, page: null, start: t, end: null });
    }
  }
  // Drop blips shorter than 2 seconds (flipping past a page), except the last.
  return out.filter((s, i) => i === out.length - 1 || s.end === null || s.end - s.start >= 2000);
}

/**
 * Groups consecutive segments on the same score, or with `keyOf`, on the same
 * piece within a score (so a book splits into its pieces).
 */
export function buildBlocks(segments: Segment[], keyOf: (s: Segment) => string | null = (s) => s.scoreId): Block[] {
  const blocks: Block[] = [];
  let lastKey: string | null | undefined;
  for (const s of segments) {
    const key = keyOf(s);
    const last = blocks[blocks.length - 1];
    if (last && lastKey === key) {
      last.segments.push(s);
      last.end = s.end;
    } else {
      blocks.push({ scoreId: s.scoreId, start: s.start, end: s.end, segments: [s] });
    }
    lastKey = key;
  }
  return blocks;
}

/** The segment open at a wall-clock time, if any. */
export function segmentAt(segments: Segment[], t: number): Segment | null {
  for (let i = segments.length - 1; i >= 0; i--) {
    const s = segments[i];
    if (s.start <= t) return s.end === null || t < s.end ? s : null;
  }
  return null;
}

/** CSS that shows only the rect of a page image, as a background crop. */
export function cropStyle(url: string, rect: Rect) {
  const w = Math.max(rect.w, 0.01);
  const h = Math.max(rect.h, 0.01);
  return {
    backgroundImage: `url("${url}")`,
    backgroundSize: `${100 / w}% ${100 / h}%`,
    backgroundPosition: `${w >= 1 ? 0 : (rect.x / (1 - w)) * 100}% ${h >= 1 ? 0 : (rect.y / (1 - h)) * 100}%`,
    backgroundRepeat: "no-repeat",
  } as const;
}

export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}
