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
