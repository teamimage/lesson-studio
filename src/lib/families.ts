import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/types";
import { inviteState, type FamilyInvite } from "@/lib/family-invites";

// Families page: the teacher's families, the children in each, and every
// parent or guardian with access, what they can see and whether they have
// signed in. Read with the teacher's own client, so row rules keep it to
// their studio.

export type FamilyStudent = Pick<Tables<"students">, "id" | "name" | "instrument" | "active" | "family_id">;

export type Guardian = Tables<"parents"> & {
  /** Children in this family the guardian can see. */
  children: FamilyStudent[];
  /** Sees every child in the family (and any added later). */
  wholeFamily: boolean;
  /** Signed in / invite waiting / not invited. */
  status: "signed-in" | "invited" | "not-invited";
  invite: FamilyInvite | null;
};

export type Family = Tables<"families"> & {
  students: FamilyStudent[];
  guardians: Guardian[];
};

export type FamiliesData = {
  /** False until families.sql has been run. */
  setup: boolean;
  families: Family[];
  /** Students not in any family yet. */
  loose: FamilyStudent[];
};

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

/** "James and Ephram", "James, Ephram and Lucy". */
export function namesList(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** What a guardian can see, in a few words: "Whole family" or "James only". */
export function accessLabel(g: Guardian, family: Family): string {
  if (g.wholeFamily) return family.students.length === 1 ? `${firstName(family.students[0].name)}` : "Whole family";
  if (!g.children.length) return "No children yet";
  return `${namesList(g.children.map((c) => firstName(c.name)))} only`;
}

export const STATUS_LABEL: Record<Guardian["status"], string> = {
  "signed-in": "Signed in",
  invited: "Invite sent",
  "not-invited": "Not invited yet",
};

export async function loadFamilies(): Promise<FamiliesData> {
  const supabase = await createClient();
  const [fam, stu, par, links, inv] = await Promise.all([
    supabase.from("families").select("*").order("name"),
    supabase.from("students").select("id, name, instrument, active, family_id").order("name"),
    supabase.from("parents").select("*").order("created_at"),
    supabase.from("student_parents").select("student_id, parent_id"),
    supabase.from("family_invites").select("*").order("created_at", { ascending: false }),
  ]);
  if (fam.error) return { setup: false, families: [], loose: (stu.data ?? []) as FamilyStudent[] };

  const students = (stu.data ?? []) as FamilyStudent[];
  const parents = par.data ?? [];
  const byStudent = new Map(students.map((s) => [s.id, s]));
  const childrenOf = new Map<string, FamilyStudent[]>();
  for (const l of links.data ?? []) {
    const s = byStudent.get(l.student_id);
    if (!s) continue;
    childrenOf.set(l.parent_id, [...(childrenOf.get(l.parent_id) ?? []), s]);
  }
  const openInvite = new Map<string, FamilyInvite>();
  for (const i of inv.data ?? []) {
    if (i.parent_id && inviteState(i) === "pending" && !openInvite.has(i.parent_id)) openInvite.set(i.parent_id, i);
  }

  const families: Family[] = (fam.data ?? []).map((f) => {
    const kids = students.filter((s) => s.family_id === f.id);
    const kidIds = new Set(kids.map((k) => k.id));
    // In this family: belongs to it, or (older parents with no family) sees
    // one of its children.
    const guardians: Guardian[] = parents
      .filter((p) => p.family_id === f.id || (!p.family_id && (childrenOf.get(p.id) ?? []).some((c) => kidIds.has(c.id))))
      .map((p) => {
        const children = (childrenOf.get(p.id) ?? []).filter((c) => kidIds.has(c.id));
        const invite = openInvite.get(p.id) ?? null;
        return {
          ...p,
          children,
          wholeFamily: p.family_id === f.id && p.whole_family && children.length === kids.length && kids.length > 0,
          status: p.user_id ? "signed-in" : invite ? "invited" : "not-invited",
          invite,
        };
      });
    return { ...f, students: kids, guardians };
  });

  return { setup: true, families, loose: students.filter((s) => !s.family_id) };
}

export async function loadFamily(id: string): Promise<{ data: FamiliesData; family: Family | null }> {
  const data = await loadFamilies();
  return { data, family: data.families.find((f) => f.id === id) ?? null };
}

/** The email to show: empty for the placeholder a guardian has before giving one. */
export function shownEmail(email: string): string {
  return email.includes("@") ? email : "";
}
