import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/types";

export type Viewer = {
  userId: string;
  email: string;
  teacher: Tables<"teachers"> | null;
  /** Parent rows that belong to this user (by user id or matching email). */
  parentRows: Tables<"parents">[];
};

// Reads the signed-in user and their roles. Redirects to /login when
// signed out. A brand-new user with no parent invitations becomes a teacher.
export async function getViewer(): Promise<Viewer> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) redirect("/login");
  const userId = claims.sub as string;
  const email = (claims.email as string | undefined) ?? "";

  const [{ data: teacher }, { data: parentRows }] = await Promise.all([
    supabase.from("teachers").select("*").eq("user_id", userId).maybeSingle(),
    supabase.from("parents").select("*"),
  ]);

  let teacherRow = teacher ?? null;
  const parents = parentRows ?? [];

  if (!teacherRow && parents.length === 0) {
    const { data: created } = await supabase
      .from("teachers")
      .insert({ user_id: userId, name: "", studio_name: "" })
      .select("*")
      .single();
    teacherRow = created ?? null;
  }

  // Claim parent rows that were matched by email so later lookups are by id.
  const unclaimed = parents.filter((p) => !p.user_id);
  if (unclaimed.length > 0) {
    await supabase
      .from("parents")
      .update({ user_id: userId })
      .in(
        "id",
        unclaimed.map((p) => p.id),
      );
  }

  return { userId, email, teacher: teacherRow, parentRows: parents };
}

export async function requireTeacher(): Promise<
  Viewer & { teacher: Tables<"teachers"> }
> {
  const viewer = await getViewer();
  if (!viewer.teacher) redirect("/family");
  return viewer as Viewer & { teacher: Tables<"teachers"> };
}
