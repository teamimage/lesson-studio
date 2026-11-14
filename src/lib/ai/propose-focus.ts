import "server-only";
import { anthropicClient, DraftError, lessonModel, usageRows } from "./draft-lesson";
import type { ClaudeUsage } from "./pricing";

// After a lesson is approved, Claude reads the record and suggests the short
// list "What we're working on": at most three focus points, and how the
// lesson went for the points already on the list. The teacher accepts,
// edits or throws away each suggestion; nothing reaches the family until
// she does. A small, cheap call.

export type FocusProposal = {
  existing: { id: string; verdict: "better" | "same" | "went_back" | "done" | "not_mentioned"; note: string }[];
  focus: { existing_id: string; title: string; piece: string; parent_cue: string; do_first: string[] }[];
};

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["existing", "focus"],
  properties: {
    existing: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "verdict", "note"],
        properties: {
          id: { type: "string" },
          verdict: { type: "string", enum: ["better", "same", "went_back", "done", "not_mentioned"] },
          note: { type: "string" },
        },
      },
    },
    focus: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["existing_id", "title", "piece", "parent_cue", "do_first"],
        properties: {
          existing_id: { type: "string" },
          title: { type: "string" },
          piece: { type: "string" },
          parent_cue: { type: "string" },
          do_first: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
} as const;

const SYSTEM = `You help a music teacher keep one short, lasting list for each student, called "What we're working on". It holds at most three focus points: the few things the teacher most wants to hear change, the kind she would say at the end of a lesson ("let the arm's weight make the sound", "short notes in Gavotte: clear start and stop"). It is not the practice checklist, which the student already has; it is what the checklist is for.

You get the record of the lesson that was just approved (summary, the teacher's focus, pieces, the practice checklist, the teacher's own words from the end of the lesson when there is a transcript) and the points already on the list.

existing: one entry for every point already on the list, by its id. verdict is what THIS lesson showed about it, from the record only: better, same, went_back (it had improved and slipped), done (the teacher said it is finished or it clearly no longer needs attention), or not_mentioned (the lesson did not touch it; never guess). note: at most twelve words in plain language on what the lesson showed, empty for not_mentioned.

focus: the list as it should stand after this lesson, at most three points, most important first. Keep a point already on the list (existing_id set to its id, title unchanged unless the lesson clearly renamed it) when the lesson still worked on it. Add a new point (existing_id empty) only for something the teacher clearly made a priority in this lesson. Prefer what the teacher said herself, and prefer how the student plays (sound, posture, intonation, rhythm, a hard spot) over what to play. If the teacher named her priorities at the end of the lesson, those are the list. Fewer than three is fine. Never invent a point the record does not support.
- title: at most eight words, in the teacher's own words where she used a phrase, written so a parent understands it. No bar numbers unless the point is one spot.
- piece: the piece, scale or exercise it belongs to, or empty when it applies to everything.
- parent_cue: one sentence of at most twenty words telling the parent what to listen or look for at home and what to say, in the teacher's words where possible ("Listen for a big, ringing sound. If it goes thin, say 'pour the weight in.'"). Empty when the record gives nothing to go on. It describes the playing, never the child's mood or behaviour.
- do_first: the ids of the checklist rows that practise this point directly, at most two per point and three across the whole list. Empty when none does.`;

export async function proposeFocus(input: string): Promise<{ proposal: FocusProposal; usage: ClaudeUsage[] }> {
  const anthropic = anthropicClient();
  const stream = anthropic.beta.messages.stream({
    model: lessonModel(),
    max_tokens: 8000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
    system: SYSTEM,
    messages: [{ role: "user", content: `${input}\n\nSuggest the list.` }],
  });
  const message = await stream.finalMessage();
  const usage = usageRows(message);
  if (message.stop_reason === "refusal") throw new DraftError("Claude declined to suggest the list.", usage);
  if (message.stop_reason === "max_tokens") throw new DraftError("The suggestion came out too long. Try again.", usage);
  const text = message.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  try {
    return { proposal: JSON.parse(text) as FocusProposal, usage };
  } catch {
    throw new DraftError("Claude's suggestion couldn't be read. Try again.", usage);
  }
}
