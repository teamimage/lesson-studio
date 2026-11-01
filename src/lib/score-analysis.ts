// What Claude found in an uploaded piece of sheet music (shared by server and
// client): the book or edition, and its pieces and movements with page ranges,
// each matched against the student's books and repertoire.

import type { Json } from "@/lib/supabase/types";

/** How a piece in the music relates to the student. */
export type SectionStatus = "current" | "learned" | "upcoming" | "other";

export type ScoreSection = {
  /** e.g. "Minuet in G" or "Sonata in C, II. Largo". */
  title: string;
  composer: string;
  /** Movement or variation name/number, "" if none. */
  movement: string;
  /** Pages of the uploaded file, 1-based and inclusive. */
  start_page: number;
  end_page: number;
  /** The matching title from the student's Suzuki book list, "" if none. */
  book_piece: string;
  /** The matching title from the student's repertoire list, "" if none. */
  repertoire_title: string;
  status: SectionStatus;
};

export type ScoreAnalysis = {
  title: string;
  /** e.g. "Suzuki Cello School, Volume 3". "" if not a known book. */
  book: string;
  /** Publisher and edition, e.g. "Alfred, revised edition (2003)". */
  edition: string;
  instrument: string;
  kind: string;
  /** One or two sentences on how this music fits the student right now. */
  fit: string;
  sections: ScoreSection[];
  pages_read: number;
  pages_total: number;
};

export type AnalysisStatus = "none" | "running" | "done" | "error";

const STATUSES: SectionStatus[] = ["current", "learned", "upcoming", "other"];

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

export function parseAnalysis(json: Json | null | undefined): ScoreAnalysis | null {
  if (!json || typeof json !== "object" || Array.isArray(json)) return null;
  const o = json as Record<string, unknown>;
  const sections = (Array.isArray(o.sections) ? o.sections : []).flatMap((x): ScoreSection[] => {
    if (!x || typeof x !== "object" || Array.isArray(x)) return [];
    const s = x as Record<string, unknown>;
    const start = Math.round(Number(s.start_page));
    const end = Math.round(Number(s.end_page));
    if (!str(s.title) || !Number.isFinite(start) || start < 1) return [];
    const status = STATUSES.includes(s.status as SectionStatus) ? (s.status as SectionStatus) : "other";
    return [
      {
        title: str(s.title),
        composer: str(s.composer),
        movement: str(s.movement),
        start_page: start,
        end_page: Number.isFinite(end) && end >= start ? end : start,
        book_piece: str(s.book_piece),
        repertoire_title: str(s.repertoire_title),
        status,
      },
    ];
  });
  return {
    title: str(o.title),
    book: str(o.book),
    edition: str(o.edition),
    instrument: str(o.instrument),
    kind: str(o.kind),
    fit: str(o.fit),
    sections: sections.sort((a, b) => a.start_page - b.start_page),
    pages_read: Number(o.pages_read) || 0,
    pages_total: Number(o.pages_total) || 0,
  };
}

/** Full display name of a section: "Sonata in C, II. Largo (Eccles)". */
export function sectionLabel(s: ScoreSection, withComposer = true): string {
  const name = s.movement && !s.title.includes(s.movement) ? `${s.title}, ${s.movement}` : s.title;
  return withComposer && s.composer && !name.includes(s.composer) ? `${name} (${s.composer})` : name;
}

export function pageRange(s: ScoreSection): string {
  return s.end_page > s.start_page ? `pp. ${s.start_page}–${s.end_page}` : `p. ${s.start_page}`;
}

/** The section a page belongs to (when two share a page, the one starting later). */
export function sectionAt(sections: ScoreSection[], page: number | null): ScoreSection | null {
  if (!page) return null;
  let found: ScoreSection | null = null;
  for (const s of sections) if (s.start_page <= page && page <= s.end_page) found = s;
  return found;
}

export const STATUS_LABELS: Record<SectionStatus, string> = {
  current: "Working on now",
  learned: "Learned",
  upcoming: "Coming up",
  other: "",
};

/** "Suzuki Book 3 for Cello.pdf" -> "Suzuki Book 3 for Cello". */
export function titleFromFileName(name: string): string {
  const base = name.replace(/\.[a-z0-9]{2,5}$/i, "").replace(/[_]+/g, " ").replace(/\s+/g, " ").trim();
  return base.slice(0, 120) || "Untitled music";
}
