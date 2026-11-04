// The sign-off every reference recording needs (an uploaded audio file or a
// link). Lesson Studio ships no recordings: a teacher brings their own, the
// same "bring your own book" rule as sheet music (see music-rights.ts).
// Suzuki recordings are copyright of the International Suzuki Association and
// its publisher, so they are never pre-loaded or shared between studios.
//
// Changing the wording? Bump the version, so each confirmation on record says
// exactly what the person agreed to.
export const REFERENCE_RIGHTS_VERSION = "2026-11-04";

export const REFERENCE_RIGHTS_STATEMENT =
  "I confirm that I own this recording (a CD, download or purchase, such as the recording that came with the book), " +
  "and the students I assign it to have their own copy of the book or recording. I'm adding it only so my students " +
  "can listen as part of their practice, and it won't be shared outside my studio.";

/** Short line shown under the uploader. */
export const REFERENCE_RIGHTS_NOTE =
  "Recordings stay private to your studio. Only families whose practice plan assigns one can play it. " +
  "Copyright stays with the performers and publisher.";
