"use server";

import { revalidatePath } from "next/cache";
import { checkPracticePinFor, pinMessage, setPracticePinFor } from "@/lib/practice-pin";

/** Unlocks the practice day editor. */
export async function unlockPracticeEdit(studentId: string, pin: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const r = await checkPracticePinFor(studentId, pin.trim());
  return r === "ok" ? { ok: true } : { ok: false, error: pinMessage(r) };
}

/** Sets, changes or removes (empty `pin`) the parent PIN for one student. */
export async function savePracticePin(
  studentId: string,
  pin: string,
  current: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const r = await setPracticePinFor(studentId, pin.trim(), current.trim());
  if (r !== "ok") return { ok: false, error: pinMessage(r) };
  revalidatePath("/settings");
  revalidatePath(`/v3/students/${studentId}/about`);
  return { ok: true };
}
