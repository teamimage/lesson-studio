// The sign-off every sheet music upload needs (a PDF, photos or scans of a
// book). Lesson Studio is "bring your own book": the music must be a copy the
// teacher or the student's family owns or is licensed to use, kept private to
// that one student. See suzuki-music-rights in project notes.
//
// Changing the wording? Bump the version, so each confirmation on record says
// exactly what the person agreed to.
export const MUSIC_RIGHTS_VERSION = "2026-11-03";

export const MUSIC_RIGHTS_STATEMENT =
  "I confirm that I or this student's family own this copy of the music (a printed book or sheet we bought, " +
  "or a digital copy we're licensed to use). I'm uploading it only to teach this student, and it won't be shared with anyone else.";

/** Short line shown under the uploader. */
export const MUSIC_RIGHTS_NOTE =
  "Music you add stays private to this student. Copyright stays with the composer and publisher.";

export type RightsConfirmation = { confirmed: boolean; version: string };
