import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { LessonFull, Student } from "@/lib/data";
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

export async function getStudentOverview(student: Student, lessons: LessonFull[]): Promise<OverviewData> {
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
    repertoire: currentRepertoire(lessons),
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
/** "Perpetual Motion: shifts" belongs to the piece "Perpetual Motion". */
const baseTitle = (t: string) => norm(t.split(/[:(–—-]/)[0]);

/**
 * "Current repertoire": everything in the last two lessons that list any
 * pieces or assignments, grouped: pieces (from the lesson's piece list, plus
 * any piece assignment not already named), scales and arpeggios, etudes,
 * other exercises (technique, theory, games), listening. Names are exactly as
 * the lesson recorded them. Something in both lessons comes first. Drafts
 * count, since that is what was played even before the write-up is approved.
 */
export function currentRepertoire(lessons: LessonFull[]): RepertoireGroup[] {
  const recent = [...lessons]
    .filter((l) => (l.lesson_pieces ?? []).length > 0 || (l.assignments ?? []).length > 0)
    .sort((a, b) => (a.lesson_date < b.lesson_date ? 1 : a.lesson_date > b.lesson_date ? -1 : 0))
    .slice(0, 2);
  const groups = new Map<RepertoireGroupKey, Map<string, RepertoireLine & { seen: Set<number> }>>();
  const add = (group: RepertoireGroupKey, key: string, title: string, activity: string | null, i: number) => {
    if (!groups.has(group)) groups.set(group, new Map());
    const g = groups.get(group)!;
    const line = g.get(key) ?? { title: title.trim(), activity, lessons: 0, latest: false, seen: new Set<number>() };
    line.seen.add(i);
    line.lessons = line.seen.size;
    line.latest = line.seen.has(0);
    g.set(key, line);
  };

  // Pieces first, so piece assignments can tell what is already listed.
  recent.forEach((lesson, i) => {
    for (const piece of lesson.lesson_pieces ?? []) add("pieces", piece.repertoire_id ?? norm(piece.title), piece.title, piece.activity, i);
  });
  const pieceNames = new Set([...(groups.get("pieces")?.values() ?? [])].map((p) => baseTitle(p.title)));

  recent.forEach((lesson, i) => {
    for (const a of lesson.assignments ?? []) {
      const title = a.title.trim();
      if (!title) continue;
      let group: RepertoireGroupKey;
      if (SCALE.test(title)) group = "scales";
      else if (ETUDE.test(title)) group = "etudes";
      else if (a.kind === "piece" || a.kind === "review") {
        if (pieceNames.has(baseTitle(title))) continue;
        group = "pieces";
      } else if (a.kind === "listening") group = "listening";
      else group = "exercises";
      add(group, group === "pieces" ? baseTitle(title) : norm(title), title, null, i);
    }
  });

  const order: RepertoireGroupKey[] = ["pieces", "scales", "etudes", "exercises", "listening"];
  return order
    .filter((k) => groups.get(k)?.size)
    .map((k) => ({
      key: k,
      label: GROUP_LABEL[k],
      items: [...groups.get(k)!.values()].map((l): RepertoireLine => ({ title: l.title, activity: l.activity, lessons: l.lessons, latest: l.latest })).sort((a, b) => b.lessons - a.lessons || Number(b.latest) - Number(a.latest)),
    }));
}

export const CHANNELS: Channel[] = ["email", "text", "push"];
