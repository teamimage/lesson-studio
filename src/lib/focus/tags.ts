// Small tags on the rows of a lesson's checklist, worked out from the
// lessons before it. Nothing on the row itself changes.
//
//   Do first    the row carries one of the focus points (at most three), so
//               a day with only ten minutes knows where to start
//   New         a piece, scale or exercise not on the list from the lesson before
//   Changed     on the last list too, with different instructions
//   3rd lesson  on the list three or more lessons running

export type RowTag = { label: string; tone: "accent" | "sage" | "amber" | "plum" };

type Row = { id: string; title: string; how: string | null };
type Listed = { lesson_date: string; assignments: Row[] };

const STOP = new Set(["the", "a", "an", "and", "of", "in", "on", "to", "with", "from", "for", "major", "minor"]);

function words(t: string): Set<string> {
  return new Set(
    t
      .toLowerCase()
      .replace(/[^a-z0-9#]+/g, " ")
      .split(" ")
      .map((w) => (w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w))
      .filter((w) => w && !STOP.has(w)),
  );
}

/** Share of the smaller set's words found in the other. */
function overlap(x: Set<string>, y: Set<string>): number {
  if (!x.size || !y.size) return x.size === y.size ? 1 : 0;
  let shared = 0;
  for (const w of x) if (y.has(w)) shared += 1;
  return shared / Math.min(x.size, y.size);
}

/** The same row under slightly different wording ("Gavotte: short notes" / "Gavotte, short notes from the beginning"). */
export function sameRow(a: string, b: string): boolean {
  const x = words(a);
  const y = words(b);
  if (!x.size || !y.size) return false;
  let shared = 0;
  for (const w of x) if (y.has(w)) shared += 1;
  return shared / Math.min(x.size, y.size) >= 0.75 && shared / Math.max(x.size, y.size) >= 0.5;
}

/** "Gavotte: m.19 fast notes" -> "Gavotte". */
function subject(title: string): string {
  return title.split(/[:,(]/)[0].trim() || title;
}

/** The instructions really changed, not just their wording ("today" / "in the lesson"). */
function howChanged(a: string | null, b: string | null): boolean {
  return overlap(words(a ?? ""), words(b ?? "")) < 0.6;
}

function ordinal(n: number): string {
  return n === 3 ? "3rd" : `${n}th`;
}

/**
 * @param current the lesson whose checklist is shown
 * @param earlier approved lessons before it, newest first
 * @param doFirst checklist row ids that carry a focus point
 */
export function rowTags(current: Listed, earlier: Listed[], doFirst: Iterable<string> = []): Record<string, RowTag> {
  const out: Record<string, RowTag> = {};
  const first = new Set(doFirst);
  let firsts = 0;
  for (const a of current.assignments) {
    if (first.has(a.id) && firsts < 3) {
      out[a.id] = { label: "Do first", tone: "accent" };
      firsts += 1;
      continue;
    }
    if (!earlier.length) continue;
    const before = earlier[0].assignments.find((b) => sameRow(a.title, b.title));
    if (!before) {
      // "New" is for a new piece, scale or exercise. A new section of a
      // piece already on the list ("Gavotte: note markings") gets no tag, or
      // most rows would carry one every week.
      const known = earlier[0].assignments.some((b) => sameRow(subject(a.title), subject(b.title)));
      if (!known) out[a.id] = { label: "New", tone: "sage" };
      continue;
    }
    let run = 1;
    for (const l of earlier) {
      if (!l.assignments.some((b) => sameRow(a.title, b.title))) break;
      run += 1;
    }
    if (howChanged(before.how, a.how)) out[a.id] = { label: "Changed", tone: "amber" };
    else if (run >= 3) out[a.id] = { label: `${ordinal(run)} lesson`, tone: "plum" };
  }
  return out;
}

/**
 * The one line at the top of a lesson record: what is new on the list and
 * what the lesson showed about the focus points.
 */
export function sinceLastLesson(
  assignments: { id: string; title: string }[],
  tags: Record<string, RowTag>,
  said: { title: string; verdict: string }[],
): { label: string; text: string }[] {
  const titles = (label: string) => assignments.filter((a) => tags[a.id]?.label === label).map((a) => a.title);
  const heard = (verdict: string) => said.filter((s) => s.verdict === verdict).map((s) => s.title);
  return [
    { label: "New", text: titles("New").join(", ") },
    { label: "Changed", text: titles("Changed").join(", ") },
    { label: "Better", text: heard("better").join(", ") },
    { label: "Went back", text: heard("went_back").join(", ") },
    { label: "Done", text: heard("done").join(", ") },
  ].filter((p) => p.text);
}
