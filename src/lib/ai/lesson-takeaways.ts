import "server-only";
import { anthropicClient, DraftError, lessonModel, usageRows } from "./draft-lesson";
import type { ClaudeUsage } from "./pricing";
import { systemWithStyle, type TeachingStyle } from "./teaching-style";
import type { Takeaways } from "@/lib/takeaways/types";

// Claude compares a student's last three approved lessons and writes the
// "Main takeaways" box on the student page: the overall progress and the few
// things that matter most, then "The specifics", each tied to the lessons it
// came from. Text only, no audio: a small, cheap call.

const LESSONS = { type: "array", items: { type: "integer" } } as const;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["overall", "takeaways", "specifics"],
  properties: {
    overall: { type: "string" },
    takeaways: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text", "piece", "scope", "lessons"],
        properties: {
          text: { type: "string" },
          piece: { type: "string" },
          scope: { type: "string", enum: ["piece", "section", "general"] },
          lessons: LESSONS,
        },
      },
    },
    specifics: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text", "piece", "lessons"],
        properties: {
          text: { type: "string" },
          piece: { type: "string" },
          lessons: LESSONS,
        },
      },
    },
  },
} as const;

const SYSTEM = `You help a music teacher and a student's family see the big picture. Each lesson record already lists many detailed working points and practice instructions; that detail is useful, but students and parents lose sight of what matters most. You compare the student's last few lessons (usually three, numbered 1 = oldest) and write a short box called "Main takeaways" for the student page, read by the teacher, the parent and the child.

You get each lesson's date, who taught it (the regular teacher, or a guest instructor), the summary, the teacher's focus, the message to the parent, the pieces with notes, and the practice checklist. Most students follow the Suzuki method: a parent supervises daily practice.

Write plainly and briefly, so a parent and a child understand it. Only what the records support: never invent progress, a problem or a bar number. Use the teacher's own words where the records have them.

- overall: one or two short sentences on the progress across these lessons: what has moved forward, and where the work is now ("Gavotte went from learning the notes to shaping the phrases; the bow arm is still the main job"). With one lesson, say what that lesson set up.
- takeaways: two to four points, most important first: the few things to keep in mind until the next lesson, the kind a teacher would sum up at the end ("Keep the bow in the lane on long notes"). Prefer what came up in more than one lesson and what the teacher made a priority. Each under 16 words. scope says how wide the point is: piece (working broadly on a whole piece), section (one passage or spot in a piece: name it, e.g. "the B section" or "bars 9 to 16"), or general (technique or habits across everything). piece is the piece, scale or exercise, or empty for general. lessons lists every lesson number the point came from.
- specifics: the concrete working points behind those takeaways, up to eight, each under 16 words: a spot, a fingering, a bowing, a rhythm, a tempo, a practice instruction. Merge the same point from different lessons into one entry and list every lesson number it came from, so the page can say whether it came up once or again and again. Put the points that keep coming back first. Leave out routine assignments with nothing to say about them ("Play Minuet 1 every day") unless they are the only thing the lessons asked.

A lesson taught by a guest instructor counts like any other, and its points are listed with its number like any other; the page labels them, so never write the guest's name or "guest" in the text. Where a guest's advice differs from the regular teacher's, keep both as separate points rather than choosing.

Never mention mood, attitude, behaviour or anything personal about the child or family; this is about the playing only.`;

export async function writeLessonTakeaways(input: string, style?: TeachingStyle): Promise<{ takeaways: Takeaways; usage: ClaudeUsage[] }> {
  const anthropic = anthropicClient();
  const stream = anthropic.beta.messages.stream({
    model: lessonModel(),
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
    system: systemWithStyle(SYSTEM, style, "lesson"),
    messages: [{ role: "user", content: `${input}\n\nWrite the main takeaways.` }],
  });
  const message = await stream.finalMessage();
  const usage = usageRows(message);
  if (message.stop_reason === "refusal") throw new DraftError("Claude declined to write the takeaways.", usage);
  if (message.stop_reason === "max_tokens") throw new DraftError("The takeaways came out too long. Try again.", usage);
  const text = message.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  try {
    return { takeaways: JSON.parse(text) as Takeaways, usage };
  } catch {
    throw new DraftError("Claude's takeaways couldn't be read. Try again.", usage);
  }
}
