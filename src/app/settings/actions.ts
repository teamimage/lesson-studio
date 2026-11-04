"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireTeacher } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";
import { SECTION_IDS, SECTION_MAX_CHARS, parseProfile, toneOf, type TeachingProfile } from "@/lib/assistant/profile";

export async function updateTeacher(fd: FormData) {
  const { teacher } = await requireTeacher();
  const supabase = await createClient();
  await supabase
    .from("teachers")
    .update({
      name: String(fd.get("name") ?? "").trim(),
      studio_name: String(fd.get("studio_name") ?? "").trim(),
    })
    .eq("id", teacher.id);
  revalidatePath("/");
  revalidatePath("/settings");
  redirect("/settings?saved=1");
}

// Sets or changes the signed-in user's password. Works for accounts that
// so far only signed in with an email code.
export async function setPassword(fd: FormData) {
  const password = String(fd.get("password") ?? "");
  const confirm = String(fd.get("confirm") ?? "");
  if (password.length < 8) redirect("/settings?password=short#password");
  if (password !== confirm) redirect("/settings?password=mismatch#password");

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    const code = error.code === "same_password" ? "same" : error.code === "weak_password" ? "weak" : "failed";
    redirect(`/settings?password=${code}#password`);
  }
  redirect("/settings?password=saved#password");
}

// The review tone (Encouraging, Balanced, Strict) that every AI review and
// draft follows. Saved on its own so the name form still works before
// teaching-assistant.sql has added the column.
export async function updateReviewTone(fd: FormData) {
  const { teacher } = await requireTeacher();
  const supabase = await createClient();
  const { error } = await supabase
    .from("teachers")
    .update({ review_tone: toneOf(fd.get("review_tone")) })
    .eq("id", teacher.id);
  revalidatePath("/settings");
  redirect(error ? "/settings?assistant=setup#assistant" : "/settings?assistant=saved#assistant");
}

// Hand edits to the teaching profile, from the assistant page.
export async function updateTeachingProfile(fd: FormData) {
  const { teacher } = await requireTeacher();
  const supabase = await createClient();
  const { data } = await supabase.from("teachers").select("*").eq("id", teacher.id).maybeSingle();
  const current = parseProfile((data as { teaching_profile?: Json | null } | null)?.teaching_profile);
  const profile: TeachingProfile = { ...current, sections: {}, updated_at: new Date().toISOString() };
  for (const id of SECTION_IDS) {
    const text = String(fd.get(`section_${id}`) ?? "").trim().slice(0, SECTION_MAX_CHARS);
    if (text) profile.sections[id] = text;
  }
  const { error } = await supabase
    .from("teachers")
    .update({ teaching_profile: profile as unknown as Json })
    .eq("id", teacher.id);
  revalidatePath("/settings/assistant");
  redirect(error ? "/settings/assistant?profile=setup#profile" : "/settings/assistant?profile=saved#profile");
}
