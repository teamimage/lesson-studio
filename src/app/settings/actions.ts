"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireTeacher } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

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
