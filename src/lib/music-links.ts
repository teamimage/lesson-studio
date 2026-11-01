// Shared (client + server): which part of the sheet music each lesson-review
// clip is about. Claude matches every AI moment of a lesson to a piece in the
// student's uploaded music (score + page) and, when bars were mentioned, the
// bars and a box around them on the page. The result is kept on the lesson's
// transcript row (lesson_transcripts.draft.music_links), so no extra table.

import { sectionLabel, type ScoreSection } from "@/lib/score-analysis";

/** A box on a page, as fractions of the page (0–1). */
export type PageBox = { x: number; y: number; w: number; h: number };

/** The bit of music a clip is about. */
export type MusicRef = {
  scoreId: string;
  /** Upload page to show first (1-based). */
  page: number;
  /** The piece's page range, so the viewer can flip through it. */
  fromPage: number;
  toPage: number;
  /** Piece name, e.g. "Gavotte (Gossec)". */
  piece: string;
  /** Bars as said in the lesson, e.g. "13–15" ("" if none). */
  bars: string;
  /** Where those bars are on the page, when Claude could find them. */
  box: PageBox | null;
};

/** One stored link: an AI moment (by time and label) → its music. */
export type StoredLink = {
  seconds: number;
  label: string;
  music: MusicRef | null;
};

export type MusicLinks = {
  /** Fingerprint of the moments these links were made for. */
  key: string;
  made_at: string;
  links: StoredLink[];
};

/** A fingerprint of a list of moments, so links go stale when the moments change. */
export function momentsKey(moments: { seconds: number; label: string }[]): string {
  let h = 5381;
  const s = moments.map((m) => `${Math.round(m.seconds)}|${m.label}`).join("\n");
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return `${moments.length}-${(h >>> 0).toString(36)}`;
}

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function parseBox(v: unknown): PageBox | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const [x, y, w, h] = [num(o.x), num(o.y), num(o.w), num(o.h)];
  if (x === null || y === null || w === null || h === null || w <= 0 || h <= 0) return null;
  const cx = Math.min(Math.max(x, 0), 1);
  const cy = Math.min(Math.max(y, 0), 1);
  return { x: cx, y: cy, w: Math.min(w, 1 - cx), h: Math.min(h, 1 - cy) };
}

function parseRef(v: unknown): MusicRef | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const page = num(o.page);
  if (typeof o.scoreId !== "string" || !page || page < 1) return null;
  const from = num(o.fromPage) ?? page;
  const to = num(o.toPage) ?? page;
  return {
    scoreId: o.scoreId,
    page,
    fromPage: Math.min(from, page),
    toPage: Math.max(to, page),
    piece: typeof o.piece === "string" ? o.piece : "",
    bars: typeof o.bars === "string" ? o.bars : "",
    box: parseBox(o.box),
  };
}

/** The links saved on a transcript draft, if any. */
export function parseMusicLinks(draft: unknown): MusicLinks | null {
  const raw = (draft as { music_links?: unknown } | null)?.music_links;
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.key !== "string" || !Array.isArray(o.links)) return null;
  return {
    key: o.key,
    made_at: typeof o.made_at === "string" ? o.made_at : "",
    links: o.links.flatMap((l) => {
      const x = (l ?? {}) as Record<string, unknown>;
      const seconds = num(x.seconds);
      if (seconds === null || typeof x.label !== "string") return [];
      return [{ seconds, label: x.label, music: parseRef(x.music) }];
    }),
  };
}

/** "bars 13–15", "bar 9", or "" */
export function barsText(bars: string): string {
  const b = bars.trim();
  if (!b) return "";
  return /[-–,]|\band\b/.test(b) ? `bars ${b.replace(/-/g, "–")}` : `bar ${b}`;
}

/** Short tag for a row: "p.18 · bars 13–15". */
export function musicTag(m: MusicRef): string {
  return [`p.${m.page}`, barsText(m.bars)].filter(Boolean).join(" · ");
}

/** Link to the read-only music viewer (never the music stand). */
export function viewerHref(
  studentId: string,
  scoreId: string,
  opts: { from?: number; to?: number; page?: number } = {},
): string {
  const q = new URLSearchParams();
  if (opts.from) q.set("from", String(opts.from));
  if (opts.to) q.set("to", String(opts.to));
  if (opts.page) q.set("page", String(opts.page));
  const s = q.toString();
  return `/students/${studentId}/music/${scoreId}${s ? `?${s}` : ""}`;
}

const STOP = new Set("the a an and of in from for with no op suzuki book cello piano violin".split(" "));
function titleWords(s: string): string[] {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\(suzuki[^)]*\)/g, "")
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1 && !STOP.has(w));
}

/**
 * The uploaded piece that a title (from a lesson, the repertoire or a book
 * list) is about: an exact book/repertoire match first, else most words shared.
 */
export function findSection<T extends { id: string; sections: ScoreSection[] }>(
  scores: T[],
  title: string,
): { score: T; section: ScoreSection } | null {
  const t = title.trim().toLowerCase();
  for (const score of scores)
    for (const section of score.sections)
      if (
        (section.book_piece && section.book_piece.toLowerCase() === t) ||
        (section.repertoire_title && section.repertoire_title.toLowerCase() === t)
      )
        return { score, section };
  const want = titleWords(title);
  if (!want.length) return null;
  let best: { score: T; section: ScoreSection; rank: number } | null = null;
  for (const score of scores)
    for (const section of score.sections) {
      const have = new Set(titleWords(`${sectionLabel(section)} ${section.book_piece}`));
      const rank = want.filter((w) => have.has(w)).length / want.length;
      if (rank >= 0.6 && (!best || rank > best.rank)) best = { score, section, rank };
    }
  return best ? { score: best.score, section: best.section } : null;
}
