// The parent or guardian consent every student needs before they are
// recorded: lesson videos, home practice recordings, and sending those to the
// services that turn them into notes. The teacher collects it on their own
// iPad or phone (parents don't sign in yet).
//
// Changing the wording? Bump the version. Everyone signed on an older version
// is asked to sign again, and each record keeps the exact text they agreed to.
// Plain wording, not legal advice: have a lawyer read it before selling.
export const CONSENT_VERSION = "2026-11-03";

export const CONSENT_RELATIONSHIPS = [
  { value: "parent", label: "Parent" },
  { value: "guardian", label: "Legal guardian" },
] as const;

export type ConsentRelationship = (typeof CONSENT_RELATIONSHIPS)[number]["value"];

export function isRelationship(v: string): v is ConsentRelationship {
  return CONSENT_RELATIONSHIPS.some((r) => r.value === v);
}

/** The wording as numbered points, with the student's and teacher's names filled in. */
export function consentPoints(studentName: string, teacherName: string): string[] {
  const s = studentName.trim() || "my child";
  const t = teacherName.trim() || "the teacher";
  const T = t.charAt(0).toUpperCase() + t.slice(1);
  return [
    `${T} may make video and sound recordings of ${s}'s music lessons in Lesson Studio, and ${s}'s home practice may be recorded in it (sound, and video only when we choose).`,
    `The recordings are kept private in Lesson Studio. Only ${t} and ${s}'s family can see them. Home practice recordings are deleted once the practice review is written; lesson videos are kept until they are deleted.`,
    `To write lesson notes and practice feedback, the recordings are sent to these companies, which run that work for Lesson Studio: AssemblyAI turns speech into text, Cloudflare Stream plays lesson videos, and Anthropic's Claude reads the text and a summary of the sound and writes the notes and feedback.`,
    `I can withdraw this permission at any time by telling ${t}. Recording then stops, and I can ask for recordings already made to be deleted.`,
  ];
}

export function consentHeading(studentName: string): string {
  return `Permission to record ${studentName.trim() || "my child"}`;
}

/** The full text saved with each signature. */
export function consentStatement(studentName: string, teacherName: string): string {
  const points = consentPoints(studentName, teacherName)
    .map((p, i) => `${i + 1}. ${p}`)
    .join("\n");
  return `${consentHeading(studentName)}\n\nI am ${studentName.trim() || "this child"}'s parent or legal guardian, and I agree that:\n${points}`;
}

export type ConsentRecord = {
  id: string;
  signerName: string;
  relationship: string;
  signedAt: string;
  collectedEmail: string;
  version: string;
  revokedAt: string | null;
  revokedEmail: string | null;
};

export type ConsentStatus =
  /** Signed on the current wording and not withdrawn: recording allowed. */
  | { state: "signed"; consent: ConsentRecord }
  /** Nothing usable on file. `last` is the newest record, if any (withdrawn or on old wording). */
  | { state: "needed"; last: ConsentRecord | null }
  /** recording-consent.sql hasn't been run yet. */
  | { state: "setup" };

export const CONSENT_SETUP_MESSAGE =
  "Recording consent isn't set up yet. Run parent-consent.sql in the Supabase SQL Editor.";

export function consentNeededMessage(firstName: string): string {
  return `A parent or guardian needs to sign the recording consent before ${firstName || "this student"} can be recorded.`;
}

export function consentPath(studentId: string, next?: string): string {
  return `/students/${studentId}/consent${next ? `?next=${encodeURIComponent(next)}` : ""}`;
}
