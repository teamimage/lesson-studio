import "server-only";
import { Constants } from "@/lib/supabase/types";
import type { LessonFull, Student } from "@/lib/data";
import { SECTION_LABELS, isTextSection, type NoteSection, type SectionProposal } from "@/lib/note-sections";
import type { ClaudeUsage } from "./pricing";
import { DraftError, anthropicClient, lessonModel, usageRows } from "./draft-lesson";
import { systemWithStyle, type TeachingStyle } from "./teaching-style";

// The teacher holds one section of the lesson record and says (or types)
// what should change. Claude rewrites only that section and returns it for
// the teacher to accept; nothing is saved here.

const TEXT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["text"],
  properties: { text: { type: "string" } },
} as const;

const PIECES_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["pieces"],
  properties: {
    pieces: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "activity", "notes"],
        properties: {
          title: { type: "string" },
          activity: { type: "string", enum: [...Constants.public.Enums.piece_activity] },
          notes: { type: "string" },
        },
      },
    },
  },
} as const;

const ASSIGNMENTS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["assignments"],
  properties: {
    assignments: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "kind", "title", "how", "every_day"],
        properties: {
          id: { type: "string" },
          kind: { type: "string", enum: [...Constants.public.Enums.assignment_kind] },
          title: { type: "string" },
          how: { type: "string" },
          every_day: { type: "boolean" },
        },
      },
    },
  },
} as const;

const SYSTEM = `You help a private music teacher edit the written record of a lesson. Most students follow the Suzuki method, and a parent reads the record and supervises home practice.

The teacher has picked one section of the record and told you, often by dictation, what should change. Rewrite that section with the change applied:
- Change only what the teacher asked for. Keep every other sentence, line and item exactly as it is, word for word.
- Keep the section's existing style and length unless asked otherwise. Write warmly and in plain words for the parent.
- The instruction is a speech transcript, so it may have filler words, false starts or misheard music terms. Work out what the teacher meant, using the student's pieces as a guide to spelling.
- If the teacher dictates new wording, use their wording, tidied into clear sentences.
- If the teacher asks to clear the section, return it empty.

For Practice assignments: titles are at most six words naming the piece, passage or exercise; "how" is one or two short sentences. Keep each unchanged assignment's id exactly as given, give an edited one its original id, and use "" as the id of a new one. Leave out any the teacher asks to remove.
For Pieces: activity is started (first time), worked_on, polished, reviewed (older piece) or performed.`;

function sectionValue(lesson: LessonFull, section: NoteSection): string {
  if (section === "pieces") {
    return JSON.stringify(
      lesson.lesson_pieces.map((p) => ({ title: p.title, activity: p.activity, notes: p.notes ?? "" })),
      null,
      1,
    );
  }
  if (section === "assignments") {
    return JSON.stringify(
      lesson.assignments.map((a) => ({
        id: a.id,
        kind: a.kind,
        title: a.title,
        how: a.how ?? "",
        every_day: a.every_day,
      })),
      null,
      1,
    );
  }
  return lesson[section] ?? "";
}

function recordText(lesson: LessonFull): string {
  const parts = [
    lesson.lesson_pieces.length && `Pieces: ${lesson.lesson_pieces.map((p) => p.title).join("; ")}`,
    lesson.summary && `Today we: ${lesson.summary}`,
    lesson.focus_points && `Focus: ${lesson.focus_points}`,
    lesson.assignments.length &&
      `Practice assignments: ${lesson.assignments.map((a) => `${a.title}${a.how ? ` (${a.how})` : ""}`).join("; ")}`,
    lesson.parent_message && `To parent: ${lesson.parent_message}`,
  ];
  return parts.filter(Boolean).join("\n");
}

export async function reviseSection(
  lesson: LessonFull,
  student: Student,
  section: NoteSection,
  instruction: string,
  style?: TeachingStyle,
): Promise<{ proposal: SectionProposal; usage: ClaudeUsage[] }> {
  const schema = section === "pieces" ? PIECES_SCHEMA : section === "assignments" ? ASSIGNMENTS_SCHEMA : TEXT_SCHEMA;
  const label = SECTION_LABELS[section];
  const prompt = [
    `Student: ${student.name}. Instrument: ${student.instrument}. Current book: ${student.current_book || "not set"}. Lesson date: ${lesson.lesson_date}.`,
    `The whole lesson record, for context:\n<record>\n${recordText(lesson) || "(empty)"}\n</record>`,
    `The section to change is "${label}". Its current content:\n<section>\n${sectionValue(lesson, section) || "(empty)"}\n</section>`,
    `The teacher's change:\n<instruction>\n${instruction}\n</instruction>`,
    `Return the whole "${label}" section with the change applied.`,
  ].join("\n\n");

  const stream = anthropicClient().beta.messages.stream({
    model: lessonModel(),
    max_tokens: 8000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low", format: { type: "json_schema", schema } },
    system: systemWithStyle(SYSTEM, style, "lesson"),
    messages: [{ role: "user", content: prompt }],
  });
  const message = await stream.finalMessage();
  const usage = usageRows(message);
  if (message.stop_reason === "refusal") throw new DraftError("Claude declined to make this change.", usage);
  if (message.stop_reason === "max_tokens") throw new DraftError("The rewrite came out too long. Try again.", usage);
  const text = message.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  let out: Record<string, unknown>;
  try {
    out = JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new DraftError("Claude's rewrite couldn't be read. Try again.", usage);
  }

  if (section === "pieces") {
    return { proposal: { section, pieces: (out.pieces ?? []) as Extract<SectionProposal, { section: "pieces" }>["pieces"] }, usage };
  }
  if (section === "assignments") {
    const known = new Set(lesson.assignments.map((a) => a.id));
    const list = (out.assignments ?? []) as Extract<SectionProposal, { section: "assignments" }>["assignments"];
    const seen = new Set<string>();
    // An id Claude made up, or used twice, becomes a new assignment.
    const assignments = list.map((a) => {
      const id = known.has(a.id) && !seen.has(a.id) ? a.id : "";
      if (id) seen.add(id);
      return { ...a, id };
    });
    return { proposal: { section, assignments }, usage };
  }
  if (!isTextSection(section)) throw new Error("Unknown section.");
  return { proposal: { section, text: String(out.text ?? "").trim() }, usage };
}
