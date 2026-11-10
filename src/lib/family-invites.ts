import "server-only";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/types";

export type FamilyInvite = Tables<"family_invites">;

/** The student's invites, newest first. Empty if the table isn't set up yet. */
export async function listFamilyInvites(studentId: string): Promise<{ invites: FamilyInvite[]; setup: boolean }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("family_invites")
    .select("*")
    .eq("student_id", studentId)
    .order("created_at", { ascending: false });
  if (error) return { invites: [], setup: error.code !== "42P01" && error.code !== "PGRST205" };
  return { invites: data ?? [], setup: true };
}

/** This site's address, as the person on this request sees it. */
export async function siteOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return host ? `${proto}://${host}` : "";
}

export function inviteState(i: FamilyInvite): "pending" | "expired" | "accepted" | "revoked" {
  if (i.status === "pending" && new Date(i.expires_at).getTime() < Date.now()) return "expired";
  return i.status === "accepted" || i.status === "revoked" ? i.status : "pending";
}
