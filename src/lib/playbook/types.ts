// The teacher playbook: short cards on how a teacher teaches, drawn from
// their own lesson recordings and accepted by them one at a time. See
// admin/teacher-playbook.sql.

export type CardKind = "rule" | "cue" | "word";
export type CardState = "proposed" | "kept" | "not_me";

export type CardQuote = {
  lesson_id: string;
  lesson_date: string;
  recording_id: string | null;
  seconds: number;
  quote: string;
};

export type PlaybookCard = {
  id: string;
  teacher_id: string;
  kind: CardKind;
  instrument: string;
  section: string;
  body: string;
  quotes: CardQuote[];
  state: CardState;
  last_heard_on: string | null;
  decided_at: string | null;
  created_at: string;
};

export const KIND_WORDS: Record<CardKind, string> = {
  rule: "How you teach",
  cue: "A cue you give",
  word: "A word you use",
};

/** Never more than this many cards waiting for an answer. */
export const MAX_WAITING = 5;
/** A word or cue not heard in a lesson for this long stops being used in reviews. */
export const WORD_EXPIRES_DAYS = 60;
/** Read at most this many lessons at a time. */
export const LESSONS_PER_READ = 4;

/** A kept line as the reviews get it. */
export type PlaybookLine = { kind: CardKind; instrument: string; body: string; last_heard_on: string | null };

/**
 * The kept lines that are still current. A rule stays until the teacher
 * removes it; a word or cue she has stopped saying drops out by itself.
 */
export function currentLines(lines: PlaybookLine[], today: string): PlaybookLine[] {
  const cutoff = new Date(`${today}T00:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - WORD_EXPIRES_DAYS);
  const from = cutoff.toISOString().slice(0, 10);
  return lines.filter((l) => l.kind === "rule" || !l.last_heard_on || l.last_heard_on >= from);
}

export function playbookText(lines: PlaybookLine[]): string {
  const row = (l: PlaybookLine) => `- ${l.body}${l.instrument ? ` (${l.instrument})` : ""}`;
  const part = (title: string, kind: CardKind) => {
    const rows = lines.filter((l) => l.kind === kind);
    return rows.length ? `${title}\n${rows.map(row).join("\n")}` : "";
  };
  return [
    part("How this teacher teaches:", "rule"),
    part("Cues this teacher gives (use them only for the instrument named):", "cue"),
    part("Words this teacher uses:", "word"),
  ]
    .filter(Boolean)
    .join("\n\n");
}
