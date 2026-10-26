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
