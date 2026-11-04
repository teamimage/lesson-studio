import "server-only";
import { anthropicClient, DraftError, lessonModel, usageRows } from "./draft-lesson";
import type { ClaudeUsage } from "./pricing";
import {
  PROFILE_SECTIONS,
  QUESTIONS,
  REVIEW_TONES,
  SECTION_MAX_CHARS,
  TONE_LABELS,
  type ReviewTone,
  type SectionId,
  type TeachingProfile,
} from "@/lib/assistant/profile";

// The teacher's own teaching assistant: a chat that interviews the teacher
// with a standard set of questions and keeps their teaching profile up to
// date from what they say. Each call sends the fixed instructions (cached,
// shared by every teacher), the current profile and the recent chat.

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["reply", "updates", "answered", "tone"],
  properties: {
    reply: { type: "string" },
    updates: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["section", "text"],
        properties: {
          section: { type: "string", enum: PROFILE_SECTIONS.map((s) => s.id) },
          text: { type: "string" },
        },
      },
    },
    answered: { type: "array", items: { type: "string", enum: QUESTIONS.map((q) => q.id) } },
    tone: { type: "string", enum: [...REVIEW_TONES, ""] },
  },
} as const;

const SYSTEM = `You are a music teacher's own teaching assistant inside Lesson Studio, an app that records lessons and home practice and writes reviews of them for the teacher and the student's family. Your job is to learn how THIS teacher teaches, so the app's reviews, grades and lesson notes follow their standards, their methods and their words, not anyone else's.

You do that by interviewing the teacher and keeping their teaching profile up to date. The profile has these sections (id: what goes in it):
${PROFILE_SECTIONS.map((s) => `- ${s.id}: ${s.label}`).join("\n")}

The standard interview, in order (id | section | question):
${QUESTIONS.map((q) => `${q.id} | ${q.section} | ${q.text}`).join("\n")}

How to run the conversation:
- Ask one question at a time, in the order above, skipping questions already marked answered or clearly covered. Use your own natural words; you may combine two short related questions. When an answer is thin or vague, ask one follow-up for a concrete example before moving on. If the teacher wants to talk about something else, follow them, then return to the interview.
- The teacher may also tell you things outside the interview ("from now on, never praise play-throughs", "my students call it the bow lane"), correct the profile, or ask what the profile says. Handle all of these.
- The teacher can set the review tone: ${REVIEW_TONES.map((t) => `${t} (${TONE_LABELS[t].hint})`).join("; ")}. Set "tone" only when they clearly ask for a change; otherwise "".
- Keep replies short and conversational: one or two sentences reflecting what you took from their answer, then the next question. No lists unless asked. Plain words; you are talking to an experienced musician and teacher, so use proper musical terms.
- When the interview is done, say so, summarise in a few lines, and invite them to add anything any time.

Updating the profile:
- After each answer, return "updates" for every section it affects: the WHOLE new text of that section, merging what was there with what they just said. Write it as clear, compact rules and facts in the teacher's own terms ("Hard spot: loop 2-3 bars at half tempo 5 times, then play from the phrase before. Restarting from the top after every slip is poor practice."). Keep their exact terms and numbers. No filler, no "the teacher says". At most ${SECTION_MAX_CHARS} characters per section: tighten older wording rather than drop rules.
- "answered": ids of interview questions this message covered (including ones answered in passing).
- Never invent anything the teacher did not say.`;

export type ChatTurn = { role: "user" | "assistant"; content: string };

export type AssistantResult = {
  reply: string;
  updates: { section: SectionId; text: string }[];
  answered: string[];
  tone: ReviewTone | "";
};

export async function askAssistant(input: {
  teacherName: string;
  tone: ReviewTone;
  profile: TeachingProfile;
  history: ChatTurn[];
  message: string;
}): Promise<{ result: AssistantResult; usage: ClaudeUsage[] }> {
  const state = [
    `Teacher: ${input.teacherName || "(name not set)"}. Review tone now: ${input.tone}.`,
    `Interview questions answered so far: ${input.profile.answered.join(", ") || "none"}.`,
    `Current teaching profile:\n${
      PROFILE_SECTIONS.map((s) => `[${s.id}] ${input.profile.sections[s.id]?.trim() || "(empty)"}`).join("\n")
    }`,
  ].join("\n\n");
  const text = input.message.trim()
    ? `${state}\n\nThe teacher says:\n<message>\n${input.message}\n</message>`
    : `${state}\n\nThe teacher has opened the assistant. ${
        input.history.length ? "Welcome them back briefly and carry on" : "Introduce yourself in two sentences (you learn how they teach so reviews follow their standards) and start the interview"
      } with the next question.`;

  // The chat so far, oldest first; it must start with the teacher.
  const history = [...input.history];
  while (history.length && history[0].role !== "user") history.shift();
  const turns: ChatTurn[] = [];
  for (const h of history) {
    const last = turns[turns.length - 1];
    if (last && last.role === h.role) last.content += `\n\n${h.content}`;
    else turns.push({ ...h });
  }
  // The new message goes last as the teacher's turn.
  if (turns.length && turns[turns.length - 1].role === "user") turns.push({ role: "assistant", content: "(no reply)" });

  const stream = anthropicClient().beta.messages.stream({
    model: lessonModel(),
    max_tokens: 8000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
    system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [...turns.map((h) => ({ role: h.role, content: h.content })), { role: "user" as const, content: text }],
  });
  const message = await stream.finalMessage();
  const usage = usageRows(message);
  if (message.stop_reason === "refusal") throw new DraftError("The assistant declined to answer that.", usage);
  if (message.stop_reason === "max_tokens") throw new DraftError("The answer came out too long. Try again.", usage);
  const out = message.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  try {
    return { result: JSON.parse(out) as AssistantResult, usage };
  } catch {
    throw new DraftError("The assistant's answer couldn't be read. Try again.", usage);
  }
}
