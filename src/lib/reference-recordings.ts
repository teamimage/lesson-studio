// Reference recordings: audio a student listens to as practice (a Suzuki
// book's tracks, other pieces). Only for listening; practice analysis never
// compares a student's playing against them.

import { matchesPiece } from "@/lib/suzuki";

export const REFERENCE_BUCKET = "reference-audio";

export type ReferenceRecording = {
  id: string;
  title: string;
  instrument: string | null;
  book: string | null;
  track_no: number | null;
  score_id: string | null;
  source: "file" | "link";
  status: "uploading" | "ready" | "failed";
  file_name: string | null;
  size_bytes: number | null;
  duration_seconds: number | null;
  link_url: string | null;
  rights: { at: string; email: string | null } | null;
};

/** What the Home practice player needs for one assigned recording. */
export type ListenTrack = {
  id: string;
  title: string;
  book: string | null;
  track_no: number | null;
  /** Signed address of the audio file, or null for a link. */
  url: string | null;
  link_url: string | null;
  duration_seconds: number | null;
};

export const AUDIO_ACCEPT = ".mp3,.m4a,.aac,.wav,.flac,.ogg,audio/*";

const MIME_BY_EXT: Record<string, string> = {
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  mp4: "audio/mp4",
  aac: "audio/aac",
  wav: "audio/wav",
  flac: "audio/flac",
  ogg: "audio/ogg",
  webm: "audio/webm",
};

export function extensionOf(name: string): string {
  const m = /\.([a-z0-9]{2,5})$/i.exec(name);
  return m ? m[1].toLowerCase() : "";
}

/** A content type the storage bucket accepts. Windows often reports none for .m4a. */
export function audioMimeFor(name: string, reported: string): string {
  const fromExt = MIME_BY_EXT[extensionOf(name)];
  if (fromExt) return fromExt;
  return reported.startsWith("audio/") ? reported : "audio/mpeg";
}

export function isAudioFile(f: { name: string; type: string }): boolean {
  return f.type.startsWith("audio/") || !!MIME_BY_EXT[extensionOf(f.name)];
}

/**
 * Guesses the track number and title from a file name such as
 * "12 Gavotte (Gossec).mp3", "Track 05 - May Song.m4a" or "1-03 Lightly Row.wav",
 * and matches the title to the book's track list when there is one.
 */
export function guessFromFileName(fileName: string, trackList: string[] = []): { track_no: number | null; title: string } {
  let base = fileName.replace(/\.[a-z0-9]{2,5}$/i, "").replace(/_/g, " ").trim();
  let track: number | null = null;
  const m = /^(?:track\s*)?(?:\d{1,2}[-.])?(\d{1,3})\s*[-.)_ ]\s*(.*)$/i.exec(base);
  if (m && m[2]) {
    track = Number(m[1]);
    base = m[2].trim();
  }
  base = base.replace(/^[-–. ]+/, "").replace(/\s+/g, " ");
  const bare = /^(?:track\s*)?(\d{1,3})$/i.exec(base);
  if (bare) {
    // "Track 12" with no name. Book CDs mix in tuning and accompaniment
    // tracks, so the number isn't used to guess the piece; the teacher names it.
    return { track_no: track ?? Number(bare[1]), title: `Track ${track ?? Number(bare[1])}` };
  }
  const match = trackList.find((t) => matchesPiece(t, base));
  if (match) return { track_no: track, title: match };
  return { track_no: track, title: base || fileName };
}

export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || !Number.isFinite(seconds)) return "";
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** "Book 2 · 12. Gavotte (Gossec)" */
export function trackLabel(r: { title: string; book?: string | null; track_no?: number | null }, withBook = true): string {
  const t = `${r.track_no ? `${r.track_no}. ` : ""}${r.title}`;
  return withBook && r.book ? `${r.book} · ${t}` : t;
}

/** Plays already counted for each assignment on one day. */
export function parsePlays(json: unknown): Record<string, number> {
  if (!json || typeof json !== "object" || Array.isArray(json)) return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(json as Record<string, unknown>)) {
    if (typeof v === "number" && Number.isFinite(v) && v > 0) out[k] = Math.floor(v);
  }
  return out;
}

export function isHttpUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

export type BookChoice = {
  book: string;
  /** Track titles in order: the built-in Suzuki list, else the pieces Claude found in uploaded music. */
  tracks: string[];
  /** Uploaded sheet music for this book, so a recording can sit next to it. */
  scoreId: string | null;
};

/** "Suzuki Cello School, Volume 2" (as Claude names an uploaded book) -> "Suzuki Cello Book 2". */
export function canonicalBook(book: string): string {
  const m = /suzuki\s+([a-z]+)\s+(?:school|book)[\s,]*(?:vol(?:ume)?\.?|book)?\s*(\d{1,2})\b/i.exec(book);
  if (!m) return book.trim();
  const inst = m[1][0].toUpperCase() + m[1].slice(1).toLowerCase();
  return `Suzuki ${inst} Book ${Number(m[2])}`;
}

/**
 * Books to file recordings under: the instrument's Suzuki books (titles only),
 * then any other book found in the student's uploaded music.
 */
export function bookChoices(
  suzukiBooks: string[],
  builtIn: { book: string; pieces: string[] }[],
  scores: { id: string; book: string; sections: { title: string; composer: string; movement: string }[] }[],
): BookChoice[] {
  const out = new Map<string, BookChoice>();
  for (const b of suzukiBooks) {
    out.set(b, { book: b, tracks: builtIn.find((x) => x.book === b)?.pieces ?? [], scoreId: null });
  }
  for (const s of scores) {
    if (!s.book) continue;
    const name = canonicalBook(s.book);
    const found = s.sections.map((x) => {
      const t = x.movement && !x.title.includes(x.movement) ? `${x.title}, ${x.movement}` : x.title;
      return x.composer && !t.includes(x.composer) ? `${t} (${x.composer})` : t;
    });
    const prev = out.get(name);
    if (prev) {
      prev.scoreId ??= s.id;
      if (!prev.tracks.length) prev.tracks = found;
    } else {
      out.set(name, { book: name, tracks: found, scoreId: s.id });
    }
  }
  return [...out.values()];
}
