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
  { id: "technique", label: "Posture, set-up and left hand" },
  { id: "bowing", label: "Bow and tone" },
  { id: "terms", label: "Words and terms you use" },
  { id: "books", label: "Method, books and repertoire" },
  { id: "lessons", label: "Lessons and lesson notes" },
  { id: "grading", label: "Grades and expectations" },
  { id: "other", label: "Anything else" },
] as const;
export type SectionId = (typeof PROFILE_SECTIONS)[number]["id"];
export const SECTION_IDS = PROFILE_SECTIONS.map((s) => s.id) as SectionId[];

/**
 * The interview comes in sets. Everyone does "basics" first; after that the
 * teacher picks the next set, in any order, whenever they like. The full
 * question bank, with the pedagogy behind it, is in
 * teaching-assistant-question-bank.md in the project files.
 */
export const LEVELS = [
  { id: "basics", title: "The basics", blurb: "Who you teach and the standards that matter most. Everyone starts here." },
  { id: "practice", title: "Practice habits", blurb: "Session length and order, repetition, slow work, play-throughs." },
  { id: "technique", title: "Technique priorities", blurb: "Set-up, bow hold, left hand, shifting, vibrato, tension." },
  { id: "sound", title: "Intonation, tone and rhythm", blurb: "What in tune means to you, the sound you want, pulse and tempo." },
  { id: "feedback", title: "Feedback and grading", blurb: "What a grade means, effort vs result, how much to correct at once." },
  { id: "lessons", title: "Lessons and assignments", blurb: "Lesson shape, notes, assignments, weekly expectations, your terms." },
  { id: "families", title: "Parents and home", blurb: "The parent's role by age, listening, routines, rewards, rough weeks." },
  { id: "repertoire", title: "Repertoire, review and reading", blurb: "Books, review pieces, reading, scales and etudes, moving on." },
] as const;
export type LevelId = (typeof LEVELS)[number]["id"];
export const LEVEL_IDS = LEVELS.map((l) => l.id) as LevelId[];

export type Question = {
  id: string;
  level: LevelId;
  section: SectionId;
  text: string;
  /** How the answer changes the assistant's critique. Shown to the model so its follow-ups aim at what matters. */
  why: string;
};

/**
 * The question bank. Ids kept from the first 28-question interview keep
 * their meaning, so earlier answers still count.
 */
export const QUESTIONS: Question[] = [
  // The basics (everyone, in order)
  { id: "who", level: "basics", section: "books", text: "What do you teach (instruments, ages, levels), and what is your method background: Suzuki, traditional, Rolland, a mix?", why: "Sets instrument-specific vocabulary, age-appropriate language and what counts as on-level for a student." },
  { id: "values", level: "basics", section: "practice", text: "If a student kept only three things from your teaching, what would they be?", why: "The teacher's top priorities. When a review can only mention one or two things, these win." },
  { id: "good", level: "basics", section: "practice", text: "Describe a really good practice session for a typical student of yours, start to finish. What happens, in what order, for how long?", why: "The model session every practice review and grade is measured against." },
  { id: "bad", level: "basics", section: "method", text: "Which practice habits do you most want caught? For example restarting from the top, playing only what's easy, practising mistakes fast, noodling.", why: "Turns into the flags the practice review raises, in the teacher's order of importance." },
  { id: "spots", level: "basics", section: "method", text: "When a student hits a hard passage, what exactly should they do? How many notes or bars, how slow, how many repetitions, then what?", why: "The recipe the practice-method analysis compares each session against: loop size, slowing, repetitions, playing through after." },
  { id: "into_standard", level: "basics", section: "intonation", text: "How strict are you about intonation for most of your students? What do you always fix, and what do you let go for now?", why: "Sets how the measured intonation is worded and what is worth mentioning at the student's level." },
  { id: "posture", level: "basics", section: "technique", text: "Which two or three posture, set-up or bow-hold points matter most at the stage most of your students are at?", why: "What the lesson draft looks for in video and proposes as standing reminders." },
  { id: "praise", level: "basics", section: "praise", text: "What earns praise from you, and what should never be praised?", why: "Gates every positive sentence in reviews, so praise is only ever for what this teacher values." },
  { id: "voice", level: "basics", section: "praise", text: "How do you tell a child that something isn't good enough yet? Give the words you'd actually use, and say if it changes for a teenager.", why: "The template for family-facing wording: register, directness and phrasing by age." },
  { id: "parent_role", level: "basics", section: "parents", text: "What is the parent's job during home practice, and how direct should messages to parents be when practice isn't going well?", why: "Decides what parent lines ask parents to do and how bluntly problems are reported to them." },

  // Practice habits
  { id: "length", level: "practice", section: "practice", text: "How long and how often should students practise at each age or level, and what counts as a real practice day?", why: "Sets day counting, missed-day flags and what a short session is worth." },
  { id: "warmup", level: "practice", section: "practice", text: "What order should a session go in: tone exercises, scales, review, new piece? How strict are you about that order?", why: "Lets reviews check session order and notice a skipped warm-up or missing review." },
  { id: "reps", level: "practice", section: "method", text: "Do you set repetition counts (say, five correct in a row, or bead and counter games)? What counts as a correct repetition?", why: "Decides when a loop counts as finished and whether a run of attempts met the assignment." },
  { id: "slow", level: "practice", section: "method", text: "How much slower should slow practice be, do you use a metronome, and how should tempo be built back up?", why: "Sets the slow-practice threshold and the tempo-ladder advice the review gives." },
  { id: "runthrough", level: "practice", section: "method", text: "When is a full play-through useful, and when is it a way of avoiding work?", why: "Decides whether play-throughs are credited or flagged in the practice-method verdict." },
  { id: "offinstrument", level: "practice", section: "practice", text: "Do you count listening, singing, air-bowing, rhythm clapping or other work away from the instrument as practice? How much?", why: "Whether non-playing work earns credit, and what reviews suggest when a child is stuck." },

  // Technique priorities
  { id: "setup", level: "technique", section: "technique", text: "How do you set up a beginner: instrument hold, body, feet or chair and endpin? Which posture faults do you see most?", why: "The posture checklist the lesson draft and reminders use." },
  { id: "bowhold", level: "technique", section: "bowing", text: "What bow hold do you teach, how do you build it (early hold, transitions), and what are the signs it's breaking down?", why: "Lets the assistant name bow-hold faults in the teacher's terms and at the right stage." },
  { id: "lefthand", level: "technique", section: "technique", text: "How do you build the left hand: frame, finger patterns, thumb, finger tapes? When do tapes come off?", why: "Left-hand comments match the teacher's frame and patterns; tapes affect how intonation slips are read." },
  { id: "shifting", level: "technique", section: "technique", text: "When do you start position work, and how do you teach shifting (guide finger, intermediate note, slide speed)?", why: "Shift-related intonation misses get explained with the teacher's shifting method, and not expected too early." },
  { id: "vibrato", level: "technique", section: "technique", text: "When and how do you introduce vibrato, and what does acceptable early vibrato sound like?", why: "Stops reviews asking for vibrato before the teacher starts it, and sets how early vibrato is judged." },
  { id: "tension", level: "technique", section: "technique", text: "Which signs of tension worry you most (raised shoulder, locked thumb, gripping, held breath), and do you teach freedom of motion before precision?", why: "How hard tension and injury risks are flagged, and whether the critique puts free motion or accuracy first." },

  // Intonation, tone and rhythm
  { id: "into_method", level: "sound", section: "intonation", text: "How do students check and fix intonation at home: ring tones, open-string checks, drones, tuner, singing? Is a tuner OK while playing?", why: "Intonation advice uses the teacher's own fixing method; sets whether tuner use during practice is fine." },
  { id: "into_system", level: "sound", section: "intonation", text: "What does in tune mean to you: tuned to the open strings, equal temperament, expressive (high leading notes)? Should the app forgive those differences?", why: "Stops the measured intonation marking deliberate expressive or just tuning as out of tune." },
  { id: "tone", level: "sound", section: "bowing", text: "Describe the sound you want, in your words, and the bad sounds you hear most (scratchy, airy, crushed, wispy).", why: "Tone comments use the teacher's vocabulary and target the faults they care about." },
  { id: "bowing", level: "sound", section: "bowing", text: "Which bowing skills do you drill at this stage (contact point, weight, speed, bow distribution, straight bow), and how?", why: "Bow critique follows the teacher's order of skills and names the exercise they use." },
  { id: "rhythm", level: "sound", section: "rhythm", text: "What do you listen for in rhythm and pulse? Which problems should be flagged (rushing, short long notes, stopping at bar lines)?", why: "Sets the rhythm faults the review watches for." },
  { id: "tempo", level: "sound", section: "rhythm", text: "How close to performance tempo should a piece be before it counts as done, and how do you treat slowing down in hard spots?", why: "Defines when a piece is finished, and whether slowing in hard spots is a fault or a sensible choice." },
  { id: "musical", level: "sound", section: "rhythm", text: "When do you expect dynamics, phrasing and musical shape, and when is it notes and rhythm first?", why: "Whether reviews comment on musicality yet, or keep to notes and rhythm." },

  // Feedback and grading
  { id: "grades", level: "feedback", section: "grading", text: "If a practice session gets a letter grade, what separates an A from a C for you?", why: "The grading rubric itself." },
  { id: "effort", level: "feedback", section: "grading", text: "Do you grade how well they practised, how it sounds, or both? What grade does a child get who practised well but still sounds rough?", why: "Balances method against result in grades." },
  { id: "words_avoid", level: "feedback", section: "praise", text: "Are there words or phrases you never want used (\"good job\", \"perfect\", \"wrong\") or always want used?", why: "A hard word list for every family-facing sentence." },
  { id: "one_thing", level: "feedback", section: "praise", text: "How many corrections do you give at once? One thing at a time, or the full list?", why: "Caps how many problems a family review names." },
  { id: "motivation", level: "feedback", section: "praise", text: "When progress is slow, what kind of encouragement is real and not empty? What keeps your students going?", why: "Which encouragement is allowed when nothing has been earned yet." },

  // Lessons and assignments
  { id: "lesson_shape", level: "lessons", section: "lessons", text: "How is a typical lesson structured, from the bow at the start to the end?", why: "Lets lesson drafts recognise each part of the lesson and summarise in order." },
  { id: "notes", level: "lessons", section: "lessons", text: "What must your lesson notes always include, and what should they leave out?", why: "The template for the AI lesson draft and printed sheet." },
  { id: "assign", level: "lessons", section: "lessons", text: "How do you write practice assignments: how specific, how many items, how many repetitions?", why: "How the draft words practice items, and what counts as doing them." },
  { id: "expect", level: "lessons", section: "grading", text: "What do you expect week to week: how much progress, how many days of practice?", why: "The bar for lesson-to-lesson reviews." },
  { id: "goals", level: "lessons", section: "lessons", text: "Do your students work toward recitals, exams, graduations or orchestra auditions? How should that shape their practice?", why: "Lets reviews connect practice to what's coming up." },
  { id: "terms", level: "lessons", section: "terms", text: "What terms do you use with students (e.g. 'Twinkle bow', 'ring tones', 'stop-prepare', 'bow lane')? Anything the reviews should call by your name for it?", why: "Every review uses the teacher's words, so the child hears one voice." },

  // Parents and home
  { id: "parent_presence", level: "families", section: "parents", text: "By age, should a parent be in the room during practice? Do they guide it, count repetitions, or just listen?", why: "What parent-facing tasks ask for at each age." },
  { id: "parent_ear", level: "families", section: "parents", text: "Many parents don't read music. What should they be told to watch and listen for?", why: "Parent lines become concrete things a non-musician can check." },
  { id: "listening", level: "families", section: "parents", text: "How much daily listening to recordings do you expect, and to what?", why: "Whether listening is assigned and checked, and how much." },
  { id: "routine", level: "families", section: "parents", text: "What is your stance on practice routines, games, charts, stickers and rewards?", why: "Which motivation ideas the assistant may suggest to families." },
  { id: "conflict", level: "families", section: "parents", text: "When practice turns into a fight at home, what do you tell the parent?", why: "The advice given when reviews show short, broken or missed sessions." },

  // Repertoire, review and reading
  { id: "books", level: "repertoire", section: "books", text: "Which method books, etude books and scale books do you use, and in what order?", why: "Lets the assistant place a student in the sequence and know what comes next." },
  { id: "rep", level: "repertoire", section: "books", text: "Which pieces are milestones or review pieces, and how much review do you expect each day?", why: "Review expectations and which old pieces matter." },
  { id: "reading", level: "repertoire", section: "books", text: "When and how do you introduce note reading, and how much reading practice do you want alongside the pieces?", why: "Whether reading is part of practice and is reviewed." },
  { id: "scales", level: "repertoire", section: "books", text: "Which scales, arpeggios and etudes do students play at each level, and how many each day?", why: "What the scale recogniser and reviews expect in a session." },
  { id: "ready", level: "repertoire", section: "books", text: "When is a student ready for the next piece? What must be in place first?", why: "Lesson-to-lesson reviews say whether a piece looks ready, by the teacher's criteria." },
];

export function questionsIn(level: LevelId) {
  return QUESTIONS.filter((q) => q.level === level);
}

/** Progress through each set of questions. */
export function levelProgress(p: TeachingProfile) {
  return LEVELS.map((l) => {
    const qs = questionsIn(l.id);
    const done = qs.filter((q) => p.answered.includes(q.id)).length;
    return { ...l, total: qs.length, done, complete: done >= qs.length };
  });
}

export function basicsDone(p: TeachingProfile) {
  return questionsIn("basics").every((q) => p.answered.includes(q.id));
}

export function answeredCount(p: TeachingProfile) {
  return QUESTIONS.filter((q) => p.answered.includes(q.id)).length;
}

export type TeachingProfile = {
  v: 1;
  sections: Partial<Record<SectionId, string>>;
  /** Interview questions already covered (or skipped by the teacher). */
  answered: string[];
  /** The set of questions the teacher chose to work on after the basics. */
  level?: LevelId;
  updated_at?: string;
};

export const EMPTY_PROFILE: TeachingProfile = { v: 1, sections: {}, answered: [] };

/** Each section is kept short so the profile stays a few thousand tokens. */
export const SECTION_MAX_CHARS = 1500;

export function parseProfile(json: Json | null | undefined): TeachingProfile {
  if (!json || typeof json !== "object" || Array.isArray(json)) return { ...EMPTY_PROFILE, sections: {}, answered: [] };
  const o = json as { sections?: unknown; answered?: unknown; level?: unknown; updated_at?: unknown };
  const sections: Partial<Record<SectionId, string>> = {};
  if (o.sections && typeof o.sections === "object" && !Array.isArray(o.sections)) {
    for (const id of SECTION_IDS) {
      const v = (o.sections as Record<string, unknown>)[id];
      if (typeof v === "string" && v.trim()) sections[id] = v.trim().slice(0, SECTION_MAX_CHARS);
    }
  }
  const answered = Array.isArray(o.answered) ? o.answered.filter((x): x is string => typeof x === "string") : [];
  const level = LEVEL_IDS.includes(o.level as LevelId) ? (o.level as LevelId) : undefined;
  return { v: 1, sections, answered, ...(level ? { level } : {}), ...(typeof o.updated_at === "string" ? { updated_at: o.updated_at } : {}) };
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

/**
 * The next question to ask: the basics in order, then the chosen set. Null
 * when the basics are done and no unfinished set is chosen, which is when
 * the assistant offers the remaining sets.
 */
export function nextQuestion(p: TeachingProfile): Question | null {
  const open = (l: LevelId) => questionsIn(l).find((q) => !p.answered.includes(q.id)) ?? null;
  return open("basics") ?? (p.level ? open(p.level) : null);
}
