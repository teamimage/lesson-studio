import type { Enums } from "@/lib/supabase/types";

export const INSTRUMENTS = ["piano", "cello", "violin", "viola", "guitar", "voice", "flute", "other"];
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
  { value: "piece", label: "Piece" },
  { value: "exercise", label: "Exercise" },
  { value: "scale", label: "Scales" },
  { value: "etude", label: "Etude" },
  { value: "other", label: "Other" },
];
