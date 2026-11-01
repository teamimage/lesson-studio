import type { Enums } from "@/lib/supabase/types";

/**
 * Instruments taught in the Suzuki Method, with how many Suzuki books are
 * published for each (Alfred editions; counts checked against the
 * International Suzuki Association instrument pages, Nov 2026).
 * Mandolin has a Suzuki study group but no published books yet.
 */
export const SUZUKI_INSTRUMENTS: { value: string; label: string; books: number }[] = [
  { value: "violin", label: "Violin", books: 10 },
  { value: "viola", label: "Viola", books: 9 },
  { value: "cello", label: "Cello", books: 10 },
  { value: "bass", label: "Bass", books: 5 },
  { value: "piano", label: "Piano", books: 7 },
  { value: "flute", label: "Flute", books: 11 },
  { value: "recorder", label: "Recorder", books: 8 },
  { value: "guitar", label: "Guitar", books: 9 },
  { value: "harp", label: "Harp", books: 5 },
  { value: "organ", label: "Organ", books: 8 },
  { value: "trumpet", label: "Trumpet", books: 1 },
  { value: "voice", label: "Voice", books: 1 },
  { value: "mandolin", label: "Mandolin", books: 0 },
];

export const INSTRUMENTS = [...SUZUKI_INSTRUMENTS.map((i) => i.value), "other"];

/** Display name for an instrument value ("bass" -> "Bass"). */
export function instrumentLabel(value: string): string {
  return SUZUKI_INSTRUMENTS.find((i) => i.value === value)?.label ?? (value ? value[0].toUpperCase() + value.slice(1) : "");
}

/** "Suzuki Cello Book 1" ... in order, for the current-book picker. */
export function suzukiBookTitles(instrument: string): string[] {
  const inst = SUZUKI_INSTRUMENTS.find((i) => i.value === instrument.toLowerCase());
  if (!inst) return [];
  return Array.from({ length: inst.books }, (_, n) => `Suzuki ${inst.label} Book ${n + 1}`);
}
export const ASSIGNMENT_KINDS: { value: Enums<"assignment_kind">; label: string }[] = [
  { value: "piece", label: "Piece" },
  { value: "review", label: "Review" },
  { value: "technique", label: "Technique" },
  { value: "game", label: "Game" },
  { value: "listening", label: "Listening" },
  { value: "theory", label: "Theory" },
  { value: "other", label: "Other" },
];
export const PIECE_ACTIVITIES: { value: Enums<"piece_activity">; label: string }[] = [
  { value: "started", label: "Started" },
  { value: "worked_on", label: "Worked on" },
  { value: "polished", label: "Polished" },
  { value: "reviewed", label: "Reviewed" },
  { value: "performed", label: "Performed" },
];

/** Private storage bucket for lesson videos (see the lesson_recordings migration). */
export const RECORDINGS_BUCKET = "lesson-recordings";

/** Private storage bucket for score page images (see the music_stand migration). */
export const SCORES_BUCKET = "lesson-scores";
export const SCORE_KINDS: { value: string; label: string }[] = [
  { value: "book", label: "Book" },
  { value: "piece", label: "Piece" },
  { value: "exercise", label: "Exercise" },
  { value: "scale", label: "Scales" },
  { value: "etude", label: "Etude" },
  { value: "other", label: "Other" },
];
