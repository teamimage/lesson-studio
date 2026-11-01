// Shared (client + server): the moments of a lesson that can be jumped to in
// its video. They come from two places:
//   - the music stand log (piece opened, page turned, bars marked), placed
//     on a video through the video's start time (recordings.started_at);
//   - the AI draft (moments it found in the transcript), already in seconds
//     from the start of the processed video.
// Practice assignments get a jump too: the time the AI gave it, or else the
// moment whose label best matches the assignment's title.

import { buildBlocks, buildSegments, formatClock, type StandEvent } from "@/lib/stand-timeline";
import { sectionAt, sectionLabel, type ScoreSection } from "@/lib/score-analysis";
import type { MusicRef, StoredLink } from "@/lib/music-links";

export type MomentKind = "piece" | "mark" | "ai";

/** A spot in a lesson video. */
export type Jump = {
  recordingId: string;
  seconds: number;
  label: string;
  /** Where the clip stops: the next bookmark (null or missing = end of video). */
  endSeconds?: number | null;
  /** What the clip is for, shown above the popup player. */
  summary?: string[];
  /** The sheet music the clip is about, shown next to the player. */
  music?: MusicRef | null;
};

export type Moment = Jump & {
  id: string;
  kind: MomentKind;
  /** Short second line: page, note, time range. */
  detail?: string;
  /** Piece rows: each page shown, as small jump chips. */
  pages?: { page: number; seconds: number }[];
};

export type MomentRecording = {
  id: string;
  startedAt: string | null;
  durationSeconds: number | null;
};

export type AiMoment = { seconds: number; label: string };

/** "4:10" or "1:02:03" → seconds. */
export function parseClock(s: string): number | null {
  const m = s.trim().match(/^(?:(\d+):)?(\d{1,3}):(\d{2})$/);
  if (!m) return null;
  return Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

/**
 * Timeline lines in text, like "4:10 Perpetual Motion, shifting" or
 * "- [12:03] Scales". Earlier AI drafts wrote these into the teacher notes.
 */
export function parseTimelineText(text: string | null | undefined): AiMoment[] {
  if (!text) return [];
  const out: AiMoment[] = [];
  for (const line of text.split(/\n|;\s+(?=\[?\d+:\d{2})/)) {
    const m = line.match(/^\s*(?:[-•*]\s*)?\[?((?:\d+:)?\d{1,3}:\d{2})\]?\s*(?:[-–—:.)]\s*)?(.+)$/);
    if (!m) continue;
    const seconds = parseClock(m[1]);
    const label = m[2].trim();
    if (seconds !== null && label) out.push({ seconds, label });
  }
  return out;
}

/** Moments the AI draft stored, if any (drafts from before this have none). */
export function draftMoments(draft: unknown): AiMoment[] {
  const list = (draft as { moments?: unknown } | null)?.moments;
  if (!Array.isArray(list)) return [];
  return list.flatMap((m) => {
    const { time, label } = (m ?? {}) as { time?: unknown; label?: unknown };
    const seconds = typeof time === "string" ? parseClock(time) : null;
    return seconds !== null && typeof label === "string" && label.trim() ? [{ seconds, label: label.trim() }] : [];
  });
}

/** The AI's video time for each drafted assignment, by normalized title. */
export function draftAssignmentTimes(draft: unknown): { title: string; seconds: number }[] {
  const list = (draft as { assignments?: unknown } | null)?.assignments;
  if (!Array.isArray(list)) return [];
  return list.flatMap((a) => {
    const { title, video_time } = (a ?? {}) as {
      title?: unknown;
      video_time?: unknown;
    };
    const seconds = typeof video_time === "string" ? parseClock(video_time) : null;
    return typeof title === "string" && seconds !== null ? [{ title, seconds }] : [];
  });
}

/** All jumpable moments, in video order. */
export function buildMoments({
  recordings,
  events,
  scoreTitles,
  scoreSections = {},
  ai,
  musicLinks = [],
}: {
  recordings: MomentRecording[];
  events: StandEvent[];
  scoreTitles: Record<string, string>;
  /** Pieces Claude found in each score, so a book's stretch splits by piece. */
  scoreSections?: Record<string, ScoreSection[]>;
  ai: { recordingId: string; moments: AiMoment[] } | null;
  /** Which music each AI moment is about (from the AI, see music-links). */
  musicLinks?: StoredLink[];
}): Moment[] {
  const out: Moment[] = [];
  const placed = recordings.filter((r) => r.startedAt);

  // A wall-clock time → the first video that covers it.
  const place = (wall: number): { recordingId: string; seconds: number } | null => {
    for (const r of placed) {
      const v = (wall - Date.parse(r.startedAt!)) / 1000;
      if (v >= -2 && (r.durationSeconds === null || v <= r.durationSeconds))
        return { recordingId: r.id, seconds: Math.max(0, v) };
    }
    return null;
  };

  if (events.length && placed.length) {
    const pieceOf = (scoreId: string | null, page: number | null) =>
      scoreId ? sectionAt(scoreSections[scoreId] ?? [], page) : null;
    const blocks = buildBlocks(buildSegments(events), (s) => {
      if (!s.scoreId) return null;
      const sec = pieceOf(s.scoreId, s.page);
      return sec ? `${s.scoreId}#${sec.start_page}` : s.scoreId;
    });
    blocks.forEach((b, i) => {
      if (!b.scoreId) return;
      const at = place(b.start);
      if (!at) return;
      const pages: { page: number; seconds: number }[] = [];
      for (const s of b.segments) {
        const p = s.page ? place(s.start) : null;
        if (p && p.recordingId === at.recordingId && s.page && pages.at(-1)?.page !== s.page)
          pages.push({ page: s.page, seconds: p.seconds });
      }
      const minutes = b.end ? Math.max(1, Math.round((b.end - b.start) / 60000)) : null;
      const firstPage = b.segments[0]?.page ?? null;
      const sec0 = pieceOf(b.scoreId, firstPage);
      out.push({
        music: firstPage
          ? {
              scoreId: b.scoreId,
              page: firstPage,
              fromPage: sec0?.start_page ?? firstPage,
              toPage: sec0?.end_page ?? Math.max(firstPage, ...b.segments.map((x) => x.page ?? 0)),
              piece: sec0 ? sectionLabel(sec0) : (scoreTitles[b.scoreId] ?? "Music"),
              bars: "",
              box: null,
            }
          : null,
        id: `piece-${i}`,
        kind: "piece",
        recordingId: at.recordingId,
        seconds: at.seconds,
        label: (() => {
          const sec = pieceOf(b.scoreId, b.segments[0]?.page ?? null);
          return sec ? sectionLabel(sec) : (scoreTitles[b.scoreId] ?? "Music");
        })(),
        detail: minutes ? `about ${minutes} min` : undefined,
        pages: pages.length > 1 ? pages : undefined,
      });
    });

    for (const m of events) {
      if (m.kind !== "mark") continue;
      const at = place(Date.parse(m.at));
      if (!at) continue;
      const sec = pieceOf(m.score_id, m.page);
      const title = sec ? sectionLabel(sec, false) : m.score_id ? scoreTitles[m.score_id] : undefined;
      out.push({
        id: `mark-${m.id}`,
        kind: "mark",
        recordingId: at.recordingId,
        // Start a little before the mark, so the passage is heard leading in.
        seconds: Math.max(0, at.seconds - 8),
        label: m.note?.trim() || "Marked bars",
        detail: [title, m.page ? `page ${m.page}` : null].filter(Boolean).join(", ") || undefined,
        music:
          m.score_id && m.page
            ? {
                scoreId: m.score_id,
                page: m.page,
                fromPage: sec?.start_page ?? m.page,
                toPage: sec?.end_page ?? m.page,
                piece: sec ? sectionLabel(sec) : (scoreTitles[m.score_id] ?? "Music"),
                bars: "",
                box: m.rect,
              }
            : null,
      });
    }
  }

  if (ai) {
    ai.moments.forEach((m, i) =>
      out.push({
        id: `ai-${i}`,
        kind: "ai",
        recordingId: ai.recordingId,
        seconds: m.seconds,
        label: m.label,
        music:
          musicLinks.find((l) => Math.abs(l.seconds - m.seconds) < 1 && l.label === m.label)?.music ??
          musicLinks.find((l) => Math.abs(l.seconds - m.seconds) < 1)?.music ??
          null,
      }),
    );
  }

  const order = recordings.map((r) => r.id);
  return out.sort((a, b) => order.indexOf(a.recordingId) - order.indexOf(b.recordingId) || a.seconds - b.seconds);
}

const STOP = new Set(
  "the a an and or of to in on for with from at by is it this that be as no op book piece pieces practice practise play review".split(
    " ",
  ),
);
export function words(s: string): string[] {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1 && !STOP.has(w));
}
const norm = (s: string) => words(s).join(" ");

/**
 * Where in the video each assignment was worked on: the AI's own time for
 * it, else the stand piece or AI moment whose label shares most of the
 * assignment title's words.
 */
export function assignmentJumps(
  assignments: { id: string; title: string }[],
  moments: Moment[],
  ai: {
    recordingId: string;
    times: { title: string; seconds: number }[];
  } | null,
): Record<string, Jump> {
  const out: Record<string, Jump> = {};
  for (const a of assignments) {
    const own = ai?.times.find((t) => norm(t.title) === norm(a.title));
    if (own && ai) {
      out[a.id] = {
        recordingId: ai.recordingId,
        seconds: own.seconds,
        label: a.title,
      };
      continue;
    }
    const want = words(a.title);
    if (!want.length) continue;
    let best: { m: Moment; score: number } | null = null;
    for (const m of moments) {
      if (m.kind === "mark") continue;
      const have = new Set(words(m.label));
      const score = want.filter((w) => have.has(w)).length / want.length;
      // Stand pieces are exact; prefer them over AI moments on a tie.
      const rank = score + (m.kind === "piece" ? 0.01 : 0);
      if (score >= 0.6 && (!best || rank > best.score)) best = { m, score: rank };
    }
    if (best)
      out[a.id] = {
        recordingId: best.m.recordingId,
        seconds: best.m.seconds,
        label: a.title,
      };
  }
  return out;
}

/** The start of the next bookmark after `seconds` in the same video. */
export function clipEnd(moments: Moment[], recordingId: string, seconds: number): number | null {
  let end: number | null = null;
  for (const m of moments) {
    if (m.recordingId !== recordingId || m.seconds <= seconds + 1) continue;
    if (end === null || m.seconds < end) end = m.seconds;
  }
  return end;
}

/**
 * Gives every moment and assignment jump its clip end (the next bookmark)
 * and a short summary for the popup: the moment's detail, notes on the piece
 * it is about, and the practice assignments worked on during the clip.
 */
export function withClipInfo(
  moments: Moment[],
  jumps: Record<string, Jump>,
  assignments: { id: string; title: string; how: string | null }[],
  pieces: { title: string; notes: string | null }[],
): { moments: Moment[]; jumps: Record<string, Jump> } {
  const outMoments = moments.map((m) => {
    const endSeconds = clipEnd(moments, m.recordingId, m.seconds);
    const lines: string[] = [];
    if (m.detail) lines.push(m.detail);
    const have = new Set(words(m.label));
    for (const p of pieces) {
      const want = words(p.title);
      if (p.notes && want.length && want.filter((w) => have.has(w)).length / want.length >= 0.6)
        lines.push(`${p.title}: ${p.notes}`);
    }
    for (const a of assignments) {
      const j = jumps[a.id];
      if (!j || j.recordingId !== m.recordingId) continue;
      if (j.seconds >= m.seconds - 1 && (endSeconds === null || j.seconds < endSeconds))
        lines.push(`Practice: ${a.title}${a.how ? `. ${a.how}` : ""}`);
    }
    return { ...m, endSeconds, summary: lines };
  });
  const outJumps: Record<string, Jump> = {};
  for (const a of assignments) {
    const j = jumps[a.id];
    if (!j) continue;
    // The music of the clip the assignment falls in (latest one starting at or before it).
    let cover: Moment | null = null;
    for (const m of outMoments)
      if (
        m.recordingId === j.recordingId &&
        m.music &&
        m.seconds <= j.seconds + 1 &&
        (!cover || m.seconds >= cover.seconds)
      )
        cover = m;
    outJumps[a.id] = {
      ...j,
      endSeconds: clipEnd(moments, j.recordingId, j.seconds),
      summary: a.how ? [a.how] : [],
      music: j.music ?? (cover && (cover.endSeconds == null || j.seconds < cover.endSeconds) ? cover.music : null),
    };
  }
  return { moments: outMoments, jumps: outJumps };
}

export { formatClock };

/** The AI's moments for a lesson: from its draft, else the "4:10 ..." lines older drafts put in the notes. */
export function lessonAiMoments(draft: unknown, teacherNotes: string | null | undefined): AiMoment[] {
  const fromDraft = draftMoments(draft);
  return fromDraft.length ? fromDraft : parseTimelineText(teacherNotes);
}
