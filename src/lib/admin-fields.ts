import { ASSIGNMENT_KINDS, INSTRUMENTS, PIECE_ACTIVITIES, SCORE_KINDS } from "@/lib/constants";

// Which columns the admin site may edit, per table, and how to show them.
export type FieldKind = "text" | "longtext" | "int" | "date" | "bool" | "email" | "select";
export type FieldSpec = {
  label: string;
  kind: FieldKind;
  /** Required fields are never set to null when left blank. */
  required?: boolean;
  options?: { value: string; label: string }[];
};

const REPERTOIRE_STATUSES = ["preview", "learning", "polishing", "review", "performed"].map((v) => ({
  value: v,
  label: v[0].toUpperCase() + v.slice(1),
}));

export const ADMIN_FIELDS = {
  teachers: {
    name: { label: "Teacher name", kind: "text" },
    studio_name: { label: "Studio name", kind: "text" },
  },
  students: {
    name: { label: "Name", kind: "text", required: true },
    instrument: {
      label: "Instrument",
      kind: "select",
      required: true,
      options: INSTRUMENTS.map((i) => ({ value: i, label: i[0].toUpperCase() + i.slice(1) })),
    },
    age: { label: "Age", kind: "int" },
    method: { label: "Method", kind: "text", required: true },
    current_book: { label: "Current book", kind: "text" },
    lesson_day: { label: "Lesson day", kind: "text" },
    lesson_time: { label: "Lesson time", kind: "text" },
    goals: { label: "Goals (parents see these)", kind: "longtext" },
    notes: { label: "Private teacher notes", kind: "longtext" },
    active: { label: "Active student", kind: "bool" },
  },
  parents: {
    name: { label: "Parent name", kind: "text", required: true },
    email: { label: "Email (they sign in with this)", kind: "email", required: true },
    supervises_practice: { label: "Supervises practice", kind: "bool" },
  },
  lessons: {
    lesson_date: { label: "Lesson date", kind: "date", required: true },
    duration_minutes: { label: "Minutes", kind: "int" },
    status: {
      label: "Status",
      kind: "select",
      required: true,
      options: [
        { value: "draft", label: "Draft (teacher only)" },
        { value: "approved", label: "Approved (parents see it)" },
      ],
    },
    summary: { label: "What we worked on", kind: "longtext" },
    focus_points: { label: "Focus points", kind: "longtext" },
    suggestions: { label: "Ideas for next lesson", kind: "longtext" },
    teacher_notes: { label: "Private teacher notes", kind: "longtext" },
    parent_message: { label: "Note to parents", kind: "longtext" },
    next_lesson_date: { label: "Next lesson", kind: "date" },
  },
  lesson_pieces: {
    title: { label: "Piece", kind: "text", required: true },
    activity: { label: "What happened", kind: "select", required: true, options: PIECE_ACTIVITIES },
    notes: { label: "Notes", kind: "text" },
  },
  assignments: {
    title: { label: "Assignment", kind: "text", required: true },
    kind: { label: "Type", kind: "select", required: true, options: ASSIGNMENT_KINDS },
    how: { label: "How", kind: "text" },
    every_day: { label: "Every day", kind: "bool" },
  },
  repertoire: {
    title: { label: "Piece", kind: "text", required: true },
    book: { label: "Book", kind: "text" },
    status: { label: "Status", kind: "select", required: true, options: REPERTOIRE_STATUSES },
    started_on: { label: "Started", kind: "date" },
    last_played_on: { label: "Last played", kind: "date" },
    notes: { label: "Notes", kind: "text" },
  },
  practice_logs: {
    practice_date: { label: "Date", kind: "date", required: true },
    minutes: { label: "Minutes", kind: "int" },
    listened: { label: "Listened", kind: "bool" },
    parent_note: { label: "Parent note", kind: "text" },
  },
  recordings: {
    label: { label: "Label", kind: "text" },
  },
  scores: {
    title: { label: "Title", kind: "text", required: true },
    kind: { label: "Type", kind: "select", required: true, options: SCORE_KINDS },
    archived: { label: "Archived", kind: "bool" },
  },
} satisfies Record<string, Record<string, FieldSpec>>;

export type AdminTable = keyof typeof ADMIN_FIELDS;

export function isAdminTable(t: string): t is AdminTable {
  return Object.prototype.hasOwnProperty.call(ADMIN_FIELDS, t);
}
