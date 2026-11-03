import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/types";
import {
  CONSENT_SETUP_MESSAGE,
  CONSENT_VERSION,
  consentNeededMessage,
  type ConsentRecord,
  type ConsentStatus,
} from "@/lib/recording-consent";

type Row = Tables<"recording_consents">;

const COLUMNS =
  "id, signer_name, signer_relationship, signed_at, collected_email, statement_version, revoked_at, revoked_email";

function toRecord(r: Pick<Row, "id" | "signer_name" | "signer_relationship" | "signed_at" | "collected_email" | "statement_version" | "revoked_at" | "revoked_email">): ConsentRecord {
  return {
    id: r.id,
    signerName: r.signer_name,
    relationship: r.signer_relationship,
    signedAt: r.signed_at,
    collectedEmail: r.collected_email,
    version: r.statement_version,
    revokedAt: r.revoked_at,
    revokedEmail: r.revoked_email,
  };
}

function isMissingTable(code: string | undefined): boolean {
  return code === "42P01" || code === "PGRST205";
}

/** Every consent on record for a student, newest first (withdrawn ones included). */
export async function listConsents(studentId: string): Promise<ConsentRecord[] | null> {
  const db = await createClient();
  const { data, error } = await db
    .from("recording_consents")
    .select(COLUMNS)
    .eq("student_id", studentId)
    .order("signed_at", { ascending: false });
  if (error) return isMissingTable(error.code) ? null : [];
  return (data ?? []).map(toRecord);
}

/** Whether a student may be recorded right now. */
export async function getConsentStatus(studentId: string): Promise<ConsentStatus> {
  const all = await listConsents(studentId);
  if (all === null) return { state: "setup" };
  const current = all.find((c) => !c.revokedAt && c.version === CONSENT_VERSION);
  if (current) return { state: "signed", consent: current };
  return { state: "needed", last: all[0] ?? null };
}

export async function hasConsent(studentId: string | null | undefined): Promise<boolean> {
  if (!studentId) return false;
  return (await getConsentStatus(studentId)).state === "signed";
}


/**
 * Why a lesson's recordings can't go to the AI services right now, or null
 * when they can (a signed consent is on file for the lesson's student).
 */
export async function lessonConsentBlock(lessonId: string): Promise<string | null> {
  const db = await createClient();
  const { data: lesson } = await db.from("lessons").select("student_id").eq("id", lessonId).maybeSingle();
  if (!lesson) return "That lesson wasn't found.";
  const status = await getConsentStatus(lesson.student_id);
  if (status.state === "setup") return CONSENT_SETUP_MESSAGE;
  if (status.state !== "signed") return consentNeededMessage("this student");
  return null;
}
