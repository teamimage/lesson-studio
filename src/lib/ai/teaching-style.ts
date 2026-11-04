import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { parseProfile, profileText, toneOf, type ReviewTone, type TeachingProfile } from "@/lib/assistant/profile";

// The teacher's review tone and teaching profile, added to the system prompt
// of every review and draft. It sits in its own system block marked for
// prompt caching: it is the same for every call by that teacher, so after the
// first call it is read from the cache at a tenth of the price.

type Db = Awaited<ReturnType<typeof createClient>>;

export type TeachingStyle = { tone: ReviewTone; profile: TeachingProfile };

export async function teachingStyleFor(db: Db, teacherId: string | null | undefined): Promise<TeachingStyle> {
  if (!teacherId) return { tone: toneOf(null), profile: parseProfile(null) };
  // select("*") so this still works before teaching-assistant.sql adds the columns.
  const { data } = await db.from("teachers").select("*").eq("id", teacherId).maybeSingle();
  const row = (data ?? {}) as { review_tone?: unknown; teaching_profile?: unknown };
  return { tone: toneOf(row.review_tone), profile: parseProfile(row.teaching_profile as never) };
}

export type StylePurpose = "practice" | "period" | "lesson";

const TONE_RULES: Record<ReviewTone, Record<StylePurpose, string>> = {
  strict: {
    practice:
      "Review tone: STRICT. Praise only what the evidence clearly earns; when nothing earned it, say nothing positive rather than invent it. Name poor practice method (restarting from the top and stalling, play-throughs without fixing anything, skipped assignments, noodling) plainly, with the numbers. Grade without any curve. Never harsh, sarcastic or shaming: a child reads this. Factual, short, kind in manner, firm in substance.",
    period:
      "Review tone: STRICT. Praise only what the period clearly earned. Name missed days, skipped assignments, poor practice method and intonation plainly with the numbers. Never harsh or shaming.",
    lesson:
      "Tone for parent-facing text: STRICT. Clear and direct about what must improve before the next lesson; praise only what was really good. Never harsh.",
  },
  balanced: {
    practice:
      "Review tone: BALANCED. Kind and factual. Praise real strengths specifically, and name problems clearly with what to do instead. No empty praise.",
    period: "Review tone: BALANCED. Kind and factual. Credit real progress and name problems clearly. No empty praise.",
    lesson: "Tone for parent-facing text: BALANCED. Warm and clear; name what needs work plainly.",
  },
  encouraging: {
    practice:
      "Review tone: ENCOURAGING. Lead with what went well and frame each problem as the next step. Still be honest: never call poor practice method good, never praise intonation the code doesn't rate in tune, and still name the main problem.",
    period:
      "Review tone: ENCOURAGING. Lead with progress and frame problems as next steps, but still name the main problem honestly.",
    lesson: "Tone for parent-facing text: ENCOURAGING. Warm and upbeat, but still say clearly what to work on.",
  },
};

/** The text added to the system prompt for this teacher. */
export function styleText(style: TeachingStyle, purpose: StylePurpose): string {
  const parts = [TONE_RULES[style.tone][purpose]];
  const profile = profileText(style.profile);
  if (profile)
    parts.push(
      `This teacher's own teaching profile, from their interview with their teaching assistant. Their standards, terms and methods come first: where they differ from the general guidance above, follow the teacher (except never invent evidence, and never praise intonation the code doesn't rate in tune). Use their terms.\n<teaching_profile>\n${profile}\n</teaching_profile>`,
    );
  return parts.join("\n\n");
}

/** System blocks: the fixed prompt, then the teacher's style, cached together. */
export function systemWithStyle(base: string, style: TeachingStyle | undefined, purpose: StylePurpose) {
  const blocks: { type: "text"; text: string; cache_control?: { type: "ephemeral" } }[] = [{ type: "text", text: base }];
  if (style) blocks.push({ type: "text", text: styleText(style, purpose) });
  blocks[blocks.length - 1].cache_control = { type: "ephemeral" };
  return blocks;
}
