import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { LessonFull, Student } from "@/lib/data";
import { findSection, viewerHref } from "@/lib/music-links";
import { sectionLabel, type ScoreSection } from "@/lib/score-analysis";
import type { Channel, Contact, MessageRow, OverviewData, RepertoireGroup, RepertoireGroupKey, RepertoireLine } from "./types";

// The student overview box at the top of the teacher's student page: who the
// student is, how to reach them and their parents, the balance, and what
// they are playing now. Every read returns something usable before
// student-overview.sql has run (ready=false, nothing editable).

type Db = Awaited<ReturnType<typeof createClient>>;

/** The new columns and the messages table aren't in the generated types. */
export function looseDb(db: Db): SupabaseClient {
  return db as unknown as SupabaseClient;
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

type ParentRow = { id: string; name: string; email: string; phone?: string | null };
type PrivateRow = {
  email?: string | null;
  phone?: string | null;
  balance_cents?: number | null;
  balance_note?: string | null;
  balance_updated_at?: string | null;
};

export async function getStudentOverview(student: Student, lessons: LessonFull[], library: Library = []): Promise<OverviewData> {
  const db = looseDb(await createClient());
  const [priv, parents, msgs] = await Promise.all([
    db.from("student_private").select("email, phone, balance_cents, balance_note, balance_updated_at").eq("student_id", student.id).maybeSingle(),
    db.from("student_parents").select("parents(*)").eq("student_id", student.id),
    db.from("messages").select("*").eq("student_id", student.id).order("created_at", { ascending: false }).limit(200),
  ]);
  // The messages table is the one thing only the new SQL makes.
  const ready = !msgs.error;
  const p = (ready ? (priv.data as PrivateRow | null) : null) ?? {};
  const parentRows = ((parents.data ?? []) as unknown as { parents: ParentRow | null }[])
    .map((r) => r.parents)
    .filter((x): x is ParentRow => !!x)
    .sort((a, b) => a.name.localeCompare(b.name));

  const contacts: Contact[] = [
    {
      key: "student",
      role: "student",
      parentId: null,
      name: student.name,
      first: firstName(student.name),
      email: p.email ?? null,
      phone: p.phone ?? null,
    },
    ...parentRows.map(
      (r): Contact => ({
        key: r.id,
        role: "parent",
        parentId: r.id,
        name: r.name,
        first: firstName(r.name),
        email: r.email || null,
        phone: r.phone ?? null,
      }),
    ),
  ];

  const playingSince = (student as { playing_since?: number | null }).playing_since ?? null;
  return {
    ready,
    playingSince,
    contacts,
    balanceCents: p.balance_cents ?? null,
    balanceNote: p.balance_note ?? null,
    balanceUpdatedAt: p.balance_updated_at ?? null,
    repertoire: currentRepertoire(lessons, student.id, library),
    messages: ready ? ((msgs.data ?? []) as MessageRow[]) : [],
  };
}

const GROUP_LABEL: Record<RepertoireGroupKey, string> = {
  pieces: "Pieces",
  scales: "Scales and arpeggios",
  etudes: "Etudes",
  exercises: "Exercises",
  listening: "Listening",
};

const SCALE = /\b(scales?|arpeggios?|broken thirds|chromatic)\b/i;
const ETUDE = /\b(etudes?|études?|studies|study no|wohlfahrt|kayser|dotzauer|czerny|burgm(ü|u)ller|hanon|schradieck|sevcik)\b/i;

const norm = (t: string) => t.trim().toLowerCase().replace(/\s+/g, " ");
const STOP = new Set(["the", "a", "an", "and", "of", "in", "no", "op"]);
const words = (t: string) =>
  t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !STOP.has(w));
const subset = (a: string[], b: Set<string>) => a.length > 0 && a.every((w) => b.has(w));

type Library = { id: string; sections: ScoreSection[] }[];
type PieceAcc = RepertoireLine & { seen: Set<number>; words: Set<string>; spotKeys: Set<string> };

/**
 * Which listed piece an assignment is about, and the spot within it.
 * "Für Elise m. 61: pedal" -> Für Elise, "m. 61: pedal".
 * "God Rest Ye: intro and outro" -> God Rest Ye Merry Gentlemen, "intro and outro".
 */
function matchPiece(title: string, pieces: PieceAcc[]): { piece: PieceAcc; spot: string } | null {
  const colon = title.indexOf(":");
  const head = colon >= 0 ? title.slice(0, colon) : title;
  const tail = colon >= 0 ? title.slice(colon + 1).trim() : "";
  const headWords = words(head);
  const all = new Set(words(title));
  for (const piece of pieces) {
    // "God Rest Ye: ..." names the piece in short.
    if (colon >= 0 && subset(headWords, piece.words)) return { piece, spot: tail || title };
    // "Für Elise m. 61: pedal" starts with the whole piece name.
    if (subset([...piece.words], all)) {
      const pieceLen = piece.title.length;
      const starts = title.toLowerCase().startsWith(piece.title.toLowerCase());
      const spot = starts ? title.slice(pieceLen).replace(/^[\s:,–—-]+/, "") : title;
      return { piece, spot: spot || title };
    }
  }
  return null;
}

/**
 * "Current repertoire": each piece once, from the last two lessons' piece
 * lists, named as in the student's music library when it's there (with a
 * link to open it), and the spots assigned in it listed under it. Then true
 * scales and arpeggios, etudes, other exercises and listening. Something in
 * both lessons comes first. Drafts count, since that is what was played
 * even before the write-up is approved.
 */
export function currentRepertoire(lessons: LessonFull[], studentId = "", library: Library = []): RepertoireGroup[] {
  const recent = [...lessons]
    .filter((l) => (l.lesson_pieces ?? []).length > 0 || (l.assignments ?? []).length > 0)
    .sort((a, b) => (a.lesson_date < b.lesson_date ? 1 : a.lesson_date > b.lesson_date ? -1 : 0))
    .slice(0, 2);

  const pieces: PieceAcc[] = [];
  const touch = (line: { seen: Set<number>; lessons: number; latest: boolean }, i: number) => {
    line.seen.add(i);
    line.lessons = line.seen.size;
    line.latest = line.seen.has(0);
  };
  const addPiece = (title: string, activity: string | null, i: number) => {
    const w = new Set(words(title));
    // Same piece under a shorter or longer name ("God Rest Ye" / "God Rest Ye Merry Gentlemen").
    let piece = pieces.find((p) => subset([...w], p.words) || subset([...p.words], w));
    if (!piece) {
      piece = { title: title.trim(), activity, lessons: 0, latest: false, spots: [], href: null, seen: new Set(), words: w, spotKeys: new Set() };
      pieces.push(piece);
    } else if (w.size > piece.words.size) {
      piece.title = title.trim();
      piece.words = w;
    }
    if (i === 0 && activity) piece.activity = activity;
    touch(piece, i);
    return piece;
  };

  recent.forEach((lesson, i) => {
    for (const p of lesson.lesson_pieces ?? []) if (p.title.trim()) addPiece(p.title, p.activity, i);
  });

  const others = new Map<RepertoireGroupKey, Map<string, RepertoireLine & { seen: Set<number> }>>();
  recent.forEach((lesson, i) => {
    for (const a of lesson.assignments ?? []) {
      const title = a.title.trim();
      if (!title) continue;
      const hit = a.kind === "listening" ? null : matchPiece(title, pieces);
      if (hit) {
        const key = norm(hit.spot);
        if (!hit.piece.spotKeys.has(key)) {
          hit.piece.spotKeys.add(key);
          hit.piece.spots.push(hit.spot);
        }
        continue;
      }
      if ((a.kind === "piece" || a.kind === "review") && !SCALE.test(title) && !ETUDE.test(title)) {
        addPiece(title.split(":")[0], null, i);
        continue;
      }
      const group: RepertoireGroupKey = SCALE.test(title)
        ? "scales"
        : ETUDE.test(title)
          ? "etudes"
          : a.kind === "listening"
            ? "listening"
            : "exercises";
      if (!others.has(group)) others.set(group, new Map());
      const g = others.get(group)!;
      const line = g.get(norm(title)) ?? { title, activity: null, lessons: 0, latest: false, spots: [], href: null, seen: new Set<number>() };
      touch(line, i);
      g.set(norm(title), line);
    }
  });

  // Name each piece as the music library does, and link to it.
  for (const piece of pieces) {
    const found = library.length ? findSection(library, piece.title) : null;
    if (!found) continue;
    piece.title = sectionLabel(found.section) || piece.title;
    if (studentId) piece.href = viewerHref(studentId, found.score.id, { from: found.section.start_page, to: found.section.end_page });
  }

  const clean = (l: RepertoireLine): RepertoireLine => ({
    title: l.title,
    activity: l.activity,
    lessons: l.lessons,
    latest: l.latest,
    spots: l.spots,
    href: l.href,
  });
  const byRecency = (a: RepertoireLine, b: RepertoireLine) => b.lessons - a.lessons || Number(b.latest) - Number(a.latest);
  const groups: RepertoireGroup[] = [];
  if (pieces.length) groups.push({ key: "pieces", label: GROUP_LABEL.pieces, items: pieces.map(clean).sort(byRecency) });
  for (const k of ["scales", "etudes", "exercises", "listening"] as RepertoireGroupKey[]) {
    const g = others.get(k);
    if (g?.size) groups.push({ key: k, label: GROUP_LABEL[k], items: [...g.values()].map(clean).sort(byRecency) });
  }
  return groups;
}

export const CHANNELS: Channel[] = ["email", "text", "push"];
