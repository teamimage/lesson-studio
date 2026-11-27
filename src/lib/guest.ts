// A guest instructor on one lesson: a name typed in when someone other than
// the student's regular teacher taught it. Stored in lessons.guest_teacher
// (guest-teacher.sql); before that is run the column is simply missing.

export const GUEST_MAX = 80;

/** The guest's name, or null when the regular teacher taught the lesson. */
export function guestOf(lesson: { guest_teacher?: string | null } | null | undefined): string | null {
  const name = lesson?.guest_teacher?.trim();
  return name ? name : null;
}

/** A typed name made safe to save: trimmed, single-spaced, at most 80 characters; "" means none. */
export function cleanGuest(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.replace(/\s+/g, " ").trim().slice(0, GUEST_MAX);
  return name || null;
}

/** True when a save failed only because guest-teacher.sql hasn't been run. */
export function guestColumnMissing(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === "42703" || error.code === "PGRST204" || /guest_teacher/.test(error.message ?? "");
}
