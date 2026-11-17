import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { LessonFull, Student } from "@/lib/data";
import type { Channel, Contact, MessageRow, OverviewData, RepertoireLine } from "./types";

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

/**
 * "Current repertoire": the pieces in the last two lessons that list any.
 * A piece in both lessons comes first. Drafts count, since the pieces are
 * what was played even before the write-up is approved.
 */
export function currentRepertoire(lessons: LessonFull[]): RepertoireLine[] {
  const recent = [...lessons]
    .filter((l) => (l.lesson_pieces ?? []).length > 0)
    .sort((a, b) => (a.lesson_date < b.lesson_date ? 1 : a.lesson_date > b.lesson_date ? -1 : 0))
    .slice(0, 2);
  const byKey = new Map<string, RepertoireLine>();
  recent.forEach((lesson, i) => {
    for (const piece of lesson.lesson_pieces) {
      const key = piece.repertoire_id ?? piece.title.trim().toLowerCase();
      const seen = byKey.get(key);
      if (seen) {
        seen.lessons += 1;
        continue;
      }
      byKey.set(key, { title: piece.title.trim(), activity: piece.activity, lessons: 1, latest: i === 0 });
    }
  });
  return [...byKey.values()].sort((a, b) => b.lessons - a.lessons || Number(b.latest) - Number(a.latest));
}

export const CHANNELS: Channel[] = ["email", "text", "push"];
