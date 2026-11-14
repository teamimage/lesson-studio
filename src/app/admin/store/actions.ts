"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { SUZUKI_INSTRUMENTS } from "@/lib/constants";
import { isCategory } from "@/lib/store";

function str(fd: FormData, key: string) {
  return String(fd.get(key) ?? "").trim();
}

function httpsOrNull(raw: string): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    return u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

function productFields(fd: FormData) {
  const category = str(fd, "category");
  const name = str(fd, "name").slice(0, 200);
  const url = httpsOrNull(str(fd, "url"));
  if (!isCategory(category) || !name || !url) return null;
  const valid = new Set(SUZUKI_INSTRUMENTS.map((i) => i.value));
  const sort = Number(str(fd, "sort_order"));
  return {
    category,
    name,
    url,
    description: str(fd, "description").slice(0, 500),
    retailer: str(fd, "retailer").slice(0, 80),
    image_url: httpsOrNull(str(fd, "image_url")),
    price_note: str(fd, "price_note").slice(0, 60),
    instruments: fd.getAll("instruments").map(String).filter((v) => valid.has(v)),
    affiliate: fd.getAll("affiliate").includes("on"),
    active: fd.getAll("active").includes("on"),
    sort_order: Number.isFinite(sort) ? Math.round(sort) : 0,
  };
}

function done(flag: string) {
  revalidatePath("/admin/store");
  revalidatePath("/store");
  revalidatePath("/family", "layout");
  redirect(`/admin/store?${flag}`);
}

export async function adminAddProduct(fd: FormData) {
  const { db } = await requireAdmin();
  const fields = productFields(fd);
  if (!fields) redirect("/admin/store?error=1#add");
  const { error } = await db.from("store_products").insert(fields);
  if (error) redirect("/admin/store?error=1#add");
  done("saved=1");
}

export async function adminUpdateProduct(fd: FormData) {
  const { db } = await requireAdmin();
  const id = str(fd, "id");
  const fields = productFields(fd);
  if (!id || !fields) redirect("/admin/store?error=1");
  const { error } = await db.from("store_products").update(fields).eq("id", id);
  if (error) redirect("/admin/store?error=1");
  done("saved=1");
}

export async function adminDeleteProduct(fd: FormData) {
  const { db } = await requireAdmin();
  const id = str(fd, "id");
  if (id) await db.from("store_products").delete().eq("id", id);
  done("deleted=1");
}
