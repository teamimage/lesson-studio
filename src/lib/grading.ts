// How practice is graded: which system (letter, pass/fail or none), how
// strict the standard is, and what each grade means. Shared by the settings
// page, the practice review prompt and the pages that show grades, so the
// words a family reads and the rules Claude grades by come from one place.
//
// The teacher sets a studio default (teachers.grading) and can change any
// student (students.grading). Each student row keeps the resolved settings,
// definitions included, so a review started from a family's phone (which
// can't read the teacher's row) still grades by the teacher's standard.

import type { Json } from "@/lib/supabase/types";

export const GRADING_SYSTEMS = ["letter", "pass_fail", "none"] as const;
export type GradingSystem = (typeof GRADING_SYSTEMS)[number];

export const GRADING_STANDARDS = ["gentle", "standard", "demanding"] as const;
export type GradingStandard = (typeof GRADING_STANDARDS)[number];

export const LETTER_GRADES = ["A", "B", "C", "D", "F"] as const;
export const PASS_FAIL_GRADES = ["Pass", "Fail"] as const;
/** Every value a stored review's grade can take. */
export const ALL_GRADES = [...LETTER_GRADES, ...PASS_FAIL_GRADES] as const;
export type GradeValue = (typeof ALL_GRADES)[number];

export type GradingConfig = {
  system: GradingSystem;
  standard: GradingStandard;
  /** The teacher's own wording for a grade, replacing the preset text. */
  definitions: Partial<Record<GradeValue, string>>;
};

/** students.grading: the resolved settings, and whether they follow the studio default. */
export type StudentGrading = GradingConfig & { follows_studio: boolean };

export const DEFAULT_GRADING: GradingConfig = { system: "letter", standard: "standard", definitions: {} };

export const SYSTEM_LABELS: Record<GradingSystem, { label: string; hint: string }> = {
  letter: { label: "Letter grade", hint: "A, B, C, D or F for each recorded practice." },
  pass_fail: { label: "Pass or fail", hint: "One clear call: did this practice do the job or not." },
  none: { label: "No grade", hint: "Reviews still say what went well and what to work on, with no mark." },
};

export const STANDARD_LABELS: Record<GradingStandard, { label: string; hint: string }> = {
  gentle: {
    label: "Gentle",
    hint: "For beginners and young children. Real work on the teacher's focus earns the top grade; intonation is reported but never lowers the grade.",
  },
  standard: {
    label: "Standard",
    hint: "The focus and most of the list, with real work on hard spots. Intonation that is often out of tune keeps it off the top grade.",
  },
  demanding: {
    label: "Demanding",
    hint: "The whole list, spot work then a run-through, steady tempo. Intonation must be at least mostly in tune for the top grade.",
  },
};

/** What each grade means, per standard. Plain enough for a parent. */
export const PRESET_DEFINITIONS: Record<GradingStandard, Record<GradeValue, string>> = {
  gentle: {
    A: "Worked on the teacher's focus with real care: slowed down or looped a hard spot.",
    B: "Practised the focus or most of the list, mostly by playing through.",
    C: "Some real practice, but the focus was left out.",
    D: "A few minutes of real practice among a lot of other playing.",
    F: "Counted, but barely practice.",
    Pass: "Worked on the teacher's focus, or on at least one assignment, with some real work on it.",
    Fail: "Nothing on the list got real work.",
  },
  standard: {
    A: "Worked on the focus and most of the list, with real work on the hard spots (looped, slowed down, then played through).",
    B: "Good practice with one thing missing, like a skipped assignment or no slow work.",
    C: "Some useful practice, but a lot left out, or mostly playing straight through.",
    D: "A little real practice with a lot of wandering.",
    F: "Counted, but barely practice.",
    Pass: "Worked on the focus and at least half the list, and fixed at least one hard spot instead of only restarting or playing through.",
    Fail: "Missed the focus or most of the list, or only restarted and played through without fixing anything.",
  },
  demanding: {
    A: "Every assignment, with spot work on each hard passage and then a full run-through at a steady tempo. Intonation at least mostly in tune.",
    B: "Nearly everything, with real spot work, but one gap: a skipped item, no run-through, or uneven intonation.",
    C: "Real work on some of the list; much left out, or mostly playing through.",
    D: "A little real practice with a lot of wandering.",
    F: "Counted, but barely practice.",
    Pass: "Every assignment touched, the focus fixed with spot work and then played through, and no piece only restarted and stalled. Intonation not often out of tune.",
    Fail: "Anything less: a skipped assignment, the focus not fixed, or restarting and stalling.",
  },
};

/** Rules that hold the grade down, per standard, for the reviewer. */
const STANDARD_RULES: Record<GradingStandard, string[]> = {
  gentle: [
    "Intonation is reported in the bullets as usual but never lowers the grade.",
    "A piece only restarted from the top and stalled, with no slow or spot work, keeps the grade at B or below (Fail on pass/fail only when nothing else on the list got real work).",
    "Covering the teacher's focus well is enough for the top grade even if other items were skipped.",
  ],
  standard: [
    "Intonation that is \"often out of tune\" on the whole session or an assigned piece keeps the grade below A (on pass/fail it doesn't fail the session by itself). \"Uneven\" goes in work_on but doesn't cap the grade.",
    "A session that keeps restarting and stalling at the same spot with no slow or spot work can't be above C, and fails on pass/fail.",
    "With a long list (more than 6 items), the focus plus about half the list counts as most of the list.",
  ],
  demanding: [
    "Intonation that is \"uneven\" or \"often out of tune\" keeps the grade below A; \"often out of tune\" fails on pass/fail.",
    "Restarting and stalling on a piece being learnt can't be above C, and fails on pass/fail.",
    "The top grade needs every assignment, spot work on the hard passages, and a full run-through afterwards.",
  ],
};

export type InstrumentFamily = "strings" | "piano" | "other";

export function instrumentFamily(instrument: string | null | undefined): InstrumentFamily {
  const i = (instrument ?? "").toLowerCase();
  if (/violin|viola|cello|bass|fiddle/.test(i)) return "strings";
  if (/piano|keyboard|organ/.test(i)) return "piano";
  return "other";
}

/** What "care" means for the grade, by instrument, limited to what the phone can hear. */
const CARE_BY_FAMILY: Record<InstrumentFamily, string> = {
  strings:
    "Care on a string instrument: intonation (from the code's measurement only), a steady pulse, and right notes. Bow use, tone and posture can't be heard from the note data; judge them only when the transcript has the parent or child talking about them, and never grade on a guess.",
  piano:
    "Care on piano: a steady pulse, right notes (where the code matched the music), and evenness. The phone follows one melody line, so hands together, balance, voicing and pedalling can't be heard; never grade on them or mention them unless the transcript does. There is no intonation for piano.",
  other: "Care: a steady pulse and right notes, where the note data shows them.",
};

function isSystem(v: unknown): v is GradingSystem {
  return typeof v === "string" && (GRADING_SYSTEMS as readonly string[]).includes(v);
}
function isStandard(v: unknown): v is GradingStandard {
  return typeof v === "string" && (GRADING_STANDARDS as readonly string[]).includes(v);
}
export function isGrade(v: unknown): v is GradeValue {
  return typeof v === "string" && (ALL_GRADES as readonly string[]).includes(v);
}

export function parseGrading(raw: Json | null | undefined | unknown): GradingConfig {
  const o = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const defs: GradingConfig["definitions"] = {};
  const d = o.definitions && typeof o.definitions === "object" ? (o.definitions as Record<string, unknown>) : {};
  for (const g of ALL_GRADES) {
    const t = d[g];
    if (typeof t === "string" && t.trim()) defs[g] = t.trim().slice(0, DEFINITION_MAX);
  }
  return {
    system: isSystem(o.system) ? o.system : DEFAULT_GRADING.system,
    standard: isStandard(o.standard) ? o.standard : DEFAULT_GRADING.standard,
    definitions: defs,
  };
}

export function parseStudentGrading(raw: Json | null | undefined | unknown): StudentGrading | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  return { ...parseGrading(raw), follows_studio: o.follows_studio !== false };
}

export const DEFINITION_MAX = 240;

export function gradesFor(system: GradingSystem): readonly GradeValue[] {
  return system === "letter" ? LETTER_GRADES : system === "pass_fail" ? PASS_FAIL_GRADES : [];
}

/** The meaning of each grade under these settings, the teacher's own words first. */
export function definitionsFor(c: GradingConfig): { grade: GradeValue; text: string; custom: boolean }[] {
  return gradesFor(c.system).map((g) => ({
    grade: g,
    text: c.definitions[g] || PRESET_DEFINITIONS[c.standard][g],
    custom: !!c.definitions[g],
  }));
}

/** The grading part of the practice review prompt. */
export function gradingPrompt(c: GradingConfig, instrument: string): string {
  const care = CARE_BY_FAMILY[instrumentFamily(instrument)];
  if (c.system === "none")
    return `grade: always "" (this teacher doesn't grade practice). grade_reason: always "".`;
  const defs = definitionsFor(c)
    .map((d) => `${d.grade}: ${d.text}`)
    .join("\n");
  const scale =
    c.system === "letter"
      ? `grade: a letter grade, A, B, C, D or F, for the quality of the practice in this session`
      : `grade: "Pass" or "Fail" for this session`;
  const top = c.system === "letter" ? "an A" : "a pass";
  return `${scale} (not the child's talent or how hard the music is), on the teacher's ${STANDARD_LABELS[c.standard].label.toUpperCase()} standard. Judge from the evidence:
- The teacher's focus first: was it worked on, and how.
- Coverage: how much of the assignment list and current pieces got real work.
- Method: isolating and looping hard spots, slow work, then getting through; not restarting from the top and stalling, and not only playing straight through.
- ${care}
- Length is not graded. Never lower a grade because the session was short or the list long: a focused 10 to 15 minutes can earn ${top} at any age. Never raise a grade for length either. Long breaks only matter when the playing that was done was thin.
Rules on this standard:
${STANDARD_RULES[c.standard].map((r) => `- ${r}`).join("\n")}
What each grade means (the teacher's definitions; follow them exactly):
${defs}
Grade fairly and without inflation; a parent and child will read it. Empty only when the session wasn't counted.
grade_reason: one short, plain sentence (under 15 words) on the main reason for the grade, in different words from the work_on bullets, naming what would raise it when it isn't the top grade ("Covered everything with careful slow work on the shift." or "Lovely Gavotte; add the D major scale for ${top}.").`;
}

/**
 * Grading for one student. A student with their own settings uses them. A
 * student following the studio uses the studio default when it could be read
 * (the teacher's row isn't readable from a family's phone), else the copy
 * saved on the student row, else the app default.
 */
export function resolveGrading(student: StudentGrading | null, studio: GradingConfig | null): GradingConfig {
  if (student && !student.follows_studio) return student;
  return studio ?? student ?? DEFAULT_GRADING;
}

// ---- Showing grades ----

/** What goes inside the grade circle. */
export function gradeMark(g: string): string {
  if (g === "Pass") return "✓";
  if (g === "Fail") return "✕";
  return g;
}

export function gradeName(g: string): string {
  return g === "Pass" || g === "Fail" ? g : `Grade ${g}`;
}

export const GRADE_TONE: Record<string, string> = {
  A: "bg-sage text-white",
  B: "bg-sage/70 text-white",
  C: "bg-amber text-white",
  D: "bg-accent text-white",
  F: "bg-danger text-white",
  Pass: "bg-sage text-white",
  Fail: "bg-danger text-white",
};

const ORDER = ["A", "Pass", "B", "C", "D", "F", "Fail"];
export function bestGrade(grades: string[]): string {
  return [...grades].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b))[0];
}

/**
 * The grading a set of reviews was written under (the newest stamped one),
 * for showing a key where the student's settings aren't to hand. Uses the
 * preset wording.
 */
export function gradingOfReviews(
  reviews: ({ grading?: { system: GradingSystem; standard: GradingStandard } } | null | undefined)[],
): GradingConfig {
  const stamp = reviews.map((r) => r?.grading).filter(Boolean).at(-1);
  return stamp ? { system: stamp.system, standard: stamp.standard, definitions: {} } : DEFAULT_GRADING;
}

/** A student row's grading (families can read it; the teacher's row they can't). */
export function gradingOfStudent(student: unknown): GradingConfig {
  return parseStudentGrading((student as { grading?: unknown } | null)?.grading) ?? DEFAULT_GRADING;
}
