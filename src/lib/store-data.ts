import "server-only";
import { createClient } from "@/lib/supabase/server";
import { daysAgoISO, fitsInstrument, type StoreProduct } from "@/lib/store";

/** The live catalogue (active products), for the teacher's setup page. */
export async function listCatalogue(): Promise<StoreProduct[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("store_products").select("*").eq("active", true);
  if (error) return []; // store-tables SQL not run yet
  return data ?? [];
}

/** Product ids a teacher switched on. */
export async function listPickedIds(teacherId: string): Promise<Set<string>> {
  const supabase = await createClient();
  const { data } = await supabase.from("teacher_store_items").select("product_id").eq("teacher_id", teacherId);
  return new Set((data ?? []).map((r) => r.product_id));
}

/** What a family sees: the teacher's live picks that suit the child's instrument. */
export async function storeForStudent(teacherId: string, instrument: string | null): Promise<StoreProduct[]> {
  const supabase = await createClient();
  const { data: picks, error } = await supabase.from("teacher_store_items").select("product_id").eq("teacher_id", teacherId);
  if (error || !picks?.length) return [];
  const { data } = await supabase
    .from("store_products")
    .select("*")
    .in("id", picks.map((r) => r.product_id))
    .eq("active", true);
  return (data ?? []).filter((p) => fitsInstrument(p, instrument));
}

/** Buy taps on a teacher's store in the last 30 days. */
export async function recentClickCount(teacherId: string): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("store_clicks")
    .select("id", { count: "exact", head: true })
    .eq("teacher_id", teacherId)
    .gte("created_at", daysAgoISO(30));
  return count ?? 0;
}
