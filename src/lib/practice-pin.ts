import "server-only";
import { createClient } from "@/lib/supabase/server";

// The parent PIN that guards changing practice records (admin/practice-pin.sql).
// The PIN lives hashed in the database and only its functions read it.
// Before that SQL has run, nothing is locked: editing works as before.

type Db = Awaited<ReturnType<typeof createClient>>;
type Rpc = { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> };
const rpc = (db: Db) => db as unknown as Rpc;

export type PinResult = "ok" | "wrong" | "locked" | "denied" | "bad" | "missing";

export async function practicePinSet(studentId: string, db?: Db): Promise<boolean> {
  const client = db ?? (await createClient());
  const { data, error } = await rpc(client).rpc("practice_pin_set", { p_student: studentId });
  return !error && data === true;
}

export async function checkPracticePinFor(studentId: string, pin: string, db?: Db): Promise<PinResult> {
  const client = db ?? (await createClient());
  const { data, error } = await rpc(client).rpc("check_practice_pin", { p_student: studentId, p_pin: pin });
  // Function missing (SQL not run yet): there is no PIN to check.
  if (error) return "ok";
  return (data as PinResult) ?? "ok";
}

export async function setPracticePinFor(studentId: string, pin: string, current: string): Promise<PinResult> {
  const db = await createClient();
  const { data, error } = await rpc(db).rpc("set_practice_pin", { p_student: studentId, p_pin: pin, p_current: current || null });
  if (error) return "missing";
  return (data as PinResult) ?? "denied";
}

export function pinMessage(r: PinResult): string {
  switch (r) {
    case "wrong":
      return "That PIN isn't right.";
    case "locked":
      return "Too many wrong tries. Try again in 15 minutes, or ask the teacher to reset the PIN.";
    case "bad":
      return "Use 4 to 8 digits.";
    case "denied":
      return "Only the student's family or teacher can do that.";
    case "missing":
      return "The PIN isn't set up yet: run admin/practice-pin.sql in Supabase first.";
    default:
      return "";
  }
}
