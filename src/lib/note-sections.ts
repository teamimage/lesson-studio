// The parts of a lesson record a teacher can change by voice or typing
// (hold a section on the lesson page). Shared by the panel, the API route
// and the save action, so it holds no server-only code.

export const TEXT_SECTIONS = {
  summary: "Today we",
  focus_points: "Focus",
  parent_message: "To parent",
  suggestions: "Next time",
  teacher_notes: "Notes",
} as const;

export type TextSection = keyof typeof TEXT_SECTIONS;
export type NoteSection = TextSection | "pieces" | "assignments";

export const SECTION_LABELS: Record<NoteSection, string> = {
  ...TEXT_SECTIONS,
  pieces: "Pieces",
  assignments: "Practice assignments",
};

export function isNoteSection(s: unknown): s is NoteSection {
  return typeof s === "string" && Object.prototype.hasOwnProperty.call(SECTION_LABELS, s);
}

export function isTextSection(s: NoteSection): s is TextSection {
  return Object.prototype.hasOwnProperty.call(TEXT_SECTIONS, s);
}

export type PieceDraft = { title: string; activity: string; notes: string };
/** id is the existing assignment's id ("" for a new one), so checkmarks survive. */
export type AssignmentDraft = { id: string; kind: string; title: string; how: string; every_day: boolean };

/** What Claude proposes for one section; nothing is saved until the teacher accepts. */
export type SectionProposal =
  | { section: TextSection; text: string }
  | { section: "pieces"; pieces: PieceDraft[] }
  | { section: "assignments"; assignments: AssignmentDraft[] };

/** Longest dictation clip, so the upload stays well under the 4.5 MB request limit. */
export const MAX_DICTATION_SECONDS = 120;
