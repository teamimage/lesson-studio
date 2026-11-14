"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireTeacher } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { STORE_LAYOUTS } from "@/lib/store";

function back(fd: FormData, flag: string) {
  const inst = String(fd.get("instrument") ?? "").replace(/[^a-z]/g, "");
  return `/store?${inst ? `instrument=${inst}&` : ""}${flag}`;
}

// Saves the ticks for the products that were on screen. Products hidden by
// the instrument filter keep whatever they had.
export async function saveStorePicks(fd: FormData) {
  const { teacher } = await requireTeacher();
  const supabase = await createClient();
  const shown = fd.getAll("shown").map(String);
  const picked = new Set(fd.getAll("pick").map(String));
  const off = shown.filter((id) => !picked.has(id));
  const on = shown.filter((id) => picked.has(id));
  if (off.length) {
    await supabase.from("teacher_store_items").delete().eq("teacher_id", teacher.id).in("product_id", off);
  }
  if (on.length) {
    const { error } = await supabase
      .from("teacher_store_items")
      .upsert(on.map((product_id) => ({ teacher_id: teacher.id, product_id })), { ignoreDuplicates: true });
    if (error) redirect(back(fd, "error=1"));
  }
  revalidatePath("/store");
  revalidatePath("/family", "layout");
  redirect(back(fd, "saved=picks"));
}

export async function saveStoreLayout(fd: FormData) {
  const { teacher } = await requireTeacher();
  const layout = String(fd.get("layout") ?? "grid");
  const note = String(fd.get("note") ?? "").trim().slice(0, 300);
  if (!STORE_LAYOUTS.some((l) => l.value === layout)) redirect(back(fd, "error=1"));
  const supabase = await createClient();
  const { error } = await supabase.from("teachers").update({ store_layout: layout, store_note: note }).eq("id", teacher.id);
  if (error) redirect(back(fd, "error=1"));
  revalidatePath("/store");
  revalidatePath("/family", "layout");
  redirect(back(fd, "saved=layout"));
}
