// A teacher's teaching profile: how they teach and what they count as good
// practice, in their own words, built up by their teaching assistant (a chat
// that interviews them) and editable by hand. It and the review tone are
// added to every AI review and lesson draft, so the standards are the
// teacher's own, not the app's. No server code here, so pages can use it.

import type { Json } from "@/lib/supabase/types";

export const REVIEW_TONES = ["encouraging", "balanced", "strict"] as const;
export type ReviewTone = (typeof REVIEW_TONES)[number];

export const TONE_LABELS: Record<ReviewTone, { label: string; hint: string }> = {
  encouraging: {
    label: "Encouraging",
    hint: "Leads with what went well and frames problems as next steps. Still honest about intonation and poor practice habits.",
  },
  balanced: {
    label: "Balanced",
    hint: "Kind and factual. Praises real strengths and names problems clearly.",
  },
  strict: {
    label: "Strict",
    hint: "Praise only when earned. Poor practice method, missed assignments and intonation are called out plainly, with no softening. Still never harsh with a child.",
  },
};

/** Before teaching-assistant.sql has run, everyone is on Strict (David's choice). */
export const DEFAULT_TONE: ReviewTone = "strict";

export function toneOf(v: unknown): ReviewTone {
  return REVIEW_TONES.includes(v as ReviewTone) ? (v as ReviewTone) : DEFAULT_TONE;
}

export const PROFILE_SECTIONS = [
  { id: "practice", label: "What good practice looks like" },
  { id: "method", label: "Practice method: spots, slow work, repetition" },
  { id: "praise", label: "Praise, criticism and talking to children" },
  { id: "parents", label: "Working with parents" },
  { id: "intonation", label: "Intonation" },
  { id: "rhythm", label: "Rhythm, pulse and tempo" },
  { id: "technique", label: "Tone, posture and technique" },
  { id: "terms", label: "Words and terms you use" },
  { id: "books", label: "Method, books and repertoire" },
  { id: "lessons", label: "Lessons and lesson notes" },
  { id: "grading", label: "Grades and expectations" },
  { id: "other", label: "Anything else" },
] as const;
export type SectionId = (typeof PROFILE_SECTIONS)[number]["id"];
export const SECTION_IDS = PROFILE_SECTIONS.map((s) => s.id) as SectionId[];

/**
 * The standard interview. The assistant asks these one at a time, in order,
 * with follow-ups when an answer is thin, and may skip what the teacher has
 * already covered.
 */
export const QUESTIONS: { id: string; section: SectionId; text: string }[] = [
  { id: "who", section: "books", text: "What do you teach (instruments, ages, levels), and which method do you follow (Suzuki, traditional, a mix)?" },
  { id: "books", section: "books", text: "Which method books, etude books and scale books do you use, and in what order?" },
  { id: "rep", section: "books", text: "Which pieces do you treat as milestones or review pieces, and how much review do you expect each day?" },
  { id: "good", section: "practice", text: "Describe a really good 15-minute practice session for one of your young students. What happens, in what order?" },
  { id: "bad", section: "practice", text: "What does poor practice look like to you? What habits do you most want the app to catch?" },
  { id: "length", section: "practice", text: "How long and how often should students practise at each age or level? What counts as enough?" },
  { id: "warmup", section: "practice", text: "Do you want scales, tone exercises or warm-ups first? How strict are you about the order?" },
  { id: "spots", section: "method", text: "When a student hits a hard spot, what exactly should they do? (How many bars, how slow, how many repeats, then what?)" },
  { id: "restart", section: "method", text: "How do you feel about starting again from the top after a mistake? When is it fine and when is it a problem?" },
  { id: "runthrough", section: "method", text: "When are full play-throughs useful, and when are they a way of avoiding work?" },
  { id: "slow", section: "method", text: "How much slower should slow practice be, and do you use a metronome? At what tempos?" },
  { id: "praise", section: "praise", text: "What earns praise from you? What do you never want praised?" },
  { id: "voice", section: "praise", text: "How do you speak to a child about a problem? Give an example of how you would say it." },
  { id: "words_avoid", section: "praise", text: "Are there words or phrases you never want used with students (or always want used)?" },
  { id: "parent_role", section: "parents", text: "What is the parent's job during home practice? What should the review ask parents to do?" },
  { id: "parent_tone", section: "parents", text: "How direct should messages to parents be when practice isn't going well?" },
  { id: "into_standard", section: "intonation", text: "How strict are you about intonation for a student at this level? What do you let go and what do you always fix?" },
  { id: "into_method", section: "intonation", text: "How do you teach students to fix intonation (ring tones, open-string checks, drones, tapes)?" },
  { id: "rhythm", section: "rhythm", text: "What do you listen for in rhythm and pulse? Common problems you want flagged?" },
  { id: "tempo", section: "rhythm", text: "How do you handle tempo: performance tempo vs practice tempo, rushing, slowing in hard spots?" },
  { id: "tone", section: "technique", text: "What do you listen for in tone and sound production on this instrument?" },
  { id: "posture", section: "technique", text: "Which posture, bow-hold or hand-position points matter most at this stage?" },
  { id: "terms", section: "terms", text: "What terms do you use with students (e.g. 'Twinkle bow', 'ring tones', 'bow lane', 'stop-prepare')? Anything the reviews should call by your name for it?" },
  { id: "lesson_shape", section: "lessons", text: "How is a typical lesson structured, and what should lesson notes always include?" },
  { id: "assign", section: "lessons", text: "How do you write practice assignments: how specific, how many items, how many repetitions?" },
  { id: "grades", section: "grading", text: "If a practice session gets a letter grade, what separates an A from a C for you?" },
  { id: "expect", section: "grading", text: "What do you expect week to week: how much progress, how many days of practice?" },
  { id: "else", section: "other", text: "Anything else about your teaching that the assistant should know when it reviews your students?" },
];

export type TeachingProfile = {
  v: 1;
  sections: Partial<Record<SectionId, string>>;
  /** Interview questions already covered. */
  answered: string[];
  updated_at?: string;
};

export const EMPTY_PROFILE: TeachingProfile = { v: 1, sections: {}, answered: [] };

/** Each section is kept short so the profile stays a few thousand tokens. */
export const SECTION_MAX_CHARS = 1500;

export function parseProfile(json: Json | null | undefined): TeachingProfile {
  if (!json || typeof json !== "object" || Array.isArray(json)) return { ...EMPTY_PROFILE, sections: {}, answered: [] };
  const o = json as { sections?: unknown; answered?: unknown; updated_at?: unknown };
  const sections: Partial<Record<SectionId, string>> = {};
  if (o.sections && typeof o.sections === "object" && !Array.isArray(o.sections)) {
    for (const id of SECTION_IDS) {
      const v = (o.sections as Record<string, unknown>)[id];
      if (typeof v === "string" && v.trim()) sections[id] = v.trim().slice(0, SECTION_MAX_CHARS);
    }
  }
  const answered = Array.isArray(o.answered) ? o.answered.filter((x): x is string => typeof x === "string") : [];
  return { v: 1, sections, answered, ...(typeof o.updated_at === "string" ? { updated_at: o.updated_at } : {}) };
}

export function profileIsEmpty(p: TeachingProfile): boolean {
  return !Object.values(p.sections).some((v) => v?.trim());
}

/** The profile as plain text, one heading per section. */
export function profileText(p: TeachingProfile): string {
  return PROFILE_SECTIONS.filter((s) => p.sections[s.id]?.trim())
    .map((s) => `${s.label}:\n${p.sections[s.id]!.trim()}`)
    .join("\n\n");
}

export function nextQuestion(p: TeachingProfile) {
  return QUESTIONS.find((q) => !p.answered.includes(q.id)) ?? null;
}
