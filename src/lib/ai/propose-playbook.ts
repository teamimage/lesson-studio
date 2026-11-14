import "server-only";
import { anthropicClient, DraftError, lessonModel, usageRows } from "./draft-lesson";
import type { ClaudeUsage } from "./pricing";
import { SECTION_IDS } from "@/lib/assistant/profile";

// Claude reads a few lesson transcripts and suggests short cards on how this
// teacher teaches, each tied to the moments it came from. The teacher
// answers Keep, Edit or Not me; only kept cards are ever used.

export type PlaybookProposal = {
  cards: {
    kind: "rule" | "cue" | "word";
    instrument: string;
    section: string;
    body: string;
    quotes: { lesson: number; at: string; quote: string }[];
  }[];
  heard_again: string[];
};

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["cards", "heard_again"],
  properties: {
    cards: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "instrument", "section", "body", "quotes"],
        properties: {
          kind: { type: "string", enum: ["rule", "cue", "word"] },
          instrument: { type: "string" },
          section: { type: "string", enum: [...SECTION_IDS] },
          body: { type: "string" },
          quotes: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["lesson", "at", "quote"],
              properties: { lesson: { type: "integer" }, at: { type: "string" }, quote: { type: "string" } },
            },
          },
        },
      },
    },
    heard_again: { type: "array", items: { type: "string" } },
  },
} as const;

const SYSTEM = `You read transcripts of a music teacher's own lessons and write down, in short cards, how this teacher teaches, so that the practice reviews and lesson notes the app writes for this teacher's families follow the teacher's own way and use the teacher's own words. The teacher reads every card and answers Keep, Edit or Not me. You are describing a person's craft to that person: be exact, modest and never flattering or critical.

Each transcript line is "[minutes:seconds] SPEAKER: words". You are told which speaker is the teacher. Other speakers are the student and sometimes a parent. Lines of counting or single words spoken over playing are cues, not conversation.

Write a card only for something the teacher does or says at least twice, in two different moments (better still, in two different lessons). One striking moment is not a habit. At most five cards, fewer when the lessons support fewer; none is a valid answer. Most valuable first.

Three kinds of card:
- rule: how the teacher teaches or what the teacher insists on, in practice method or in the way a lesson runs ("Play the hard bar correctly three times in a row before going on."). Rules about how to practise apply to any instrument: leave instrument empty.
- cue: a technique instruction or image the teacher gives for a particular instrument ("Thumb bent and soft on the bow."). Set instrument (cello, piano, violin...).
The examples in brackets only show the form; never copy them.
- word: a term or phrase the teacher uses with a particular meaning, written as the phrase, a colon and what it means in this teacher's lessons ("Tunnel fingers: curved fingers that leave room underneath."). Set instrument when it belongs to one.

body: one or two short sentences, at most 30 words, in the teacher's own words wherever possible, written as the teacher would say it to a student or parent. No "the teacher". No bar numbers or piece names unless the card is about that piece.
section: where it belongs in the teacher's profile: practice (what good practice looks like), method (spots, slow work, repetition), praise (praise and talking to children), parents, intonation, rhythm, technique (posture, set-up, left hand), bowing (bow and tone), terms (words and terms), books, lessons, grading or other.
quotes: two or three moments the card comes from: lesson is the lesson's number as given, at is the time exactly as written at the start of that line, quote is the teacher's exact words from that line, at most 25 words, cut with "..." if longer. Only the teacher's own lines. Never quote the student or a parent.

Leave out, always: anything about the child's character, mood, behaviour or family; anything said about people not in the room; scheduling and small talk; anything the teacher says only once; judgements of the teacher's teaching. Do not repeat a card already kept or one the teacher marked "Not me" (both are listed for you), in the same or different words.

heard_again: the ids of the already-kept cards whose rule, cue or word clearly appears again in these lessons. Only when it is really there.`;

export async function proposePlaybook(input: string): Promise<{ proposal: PlaybookProposal; usage: ClaudeUsage[] }> {
  const anthropic = anthropicClient();
  const stream = anthropic.beta.messages.stream({
    model: lessonModel(),
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
    system: SYSTEM,
    messages: [{ role: "user", content: `${input}\n\nWrite the cards.` }],
  });
  const message = await stream.finalMessage();
  const usage = usageRows(message);
  if (message.stop_reason === "refusal") throw new DraftError("Claude declined to read these lessons.", usage);
  if (message.stop_reason === "max_tokens") throw new DraftError("The cards came out too long. Try again.", usage);
  const text = message.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  try {
    return { proposal: JSON.parse(text) as PlaybookProposal, usage };
  } catch {
    throw new DraftError("Claude's cards couldn't be read. Try again.", usage);
  }
}
