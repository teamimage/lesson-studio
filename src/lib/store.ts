import type { Tables } from "@/lib/supabase/types";

export type StoreProduct = Tables<"store_products">;

/** Fixed store sections, set by the owner. Teachers can't add or rename them. */
export const STORE_CATEGORIES: { value: string; label: string; hint: string }[] = [
  { value: "instruments", label: "Instruments", hint: "Instruments, outfits and fractional sizes" },
  { value: "accessories", label: "Accessories & care", hint: "Rosin, shoulder rests, endpin anchors, cases, cleaning" },
  { value: "strings", label: "Strings & reeds", hint: "String sets, single strings, reeds, valve oil" },
  { value: "books", label: "Books & sheet music", hint: "Method books, repertoire, theory" },
  { value: "recordings", label: "Recordings", hint: "Listening recordings for each book" },
  { value: "practice", label: "Practice tools", hint: "Stands, tuners, metronomes, mutes, mirrors" },
  { value: "general", label: "General & motivation", hint: "Practice logs, motivational books, gifts" },
];

export const STORE_LAYOUTS: { value: string; label: string; hint: string }[] = [
  { value: "grid", label: "Cards", hint: "Picture cards, two or three across" },
  { value: "list", label: "List", hint: "One row per item with its description" },
  { value: "compact", label: "Compact", hint: "Names and Buy buttons only" },
];

/** Suggested retailers for the admin form (free text is allowed too). */
export const RETAILERS = [
  "Shar Music",
  "Sweetwater",
  "Sheet Music Plus",
  "Woodwind & Brasswind",
  "Musician's Friend",
  "Yamaha",
  "Musicnotes",
  "Amazon",
];

export const STORE_DISCLOSURE =
  "Your teacher and Lesson Studio may earn a small commission when you buy through these links. The price is the same for you.";

export function categoryLabel(value: string): string {
  return STORE_CATEGORIES.find((c) => c.value === value)?.label ?? value;
}

export function isCategory(value: string): boolean {
  return STORE_CATEGORIES.some((c) => c.value === value);
}

export function layoutOf(teacher: { store_layout?: string } | null | undefined): string {
  const v = teacher?.store_layout;
  return STORE_LAYOUTS.some((l) => l.value === v) ? (v as string) : "grid";
}

/** A product suits an instrument when it lists it, or lists none (general items). */
export function fitsInstrument(p: Pick<StoreProduct, "instruments">, instrument: string | null | undefined): boolean {
  if (!instrument) return true;
  return p.instruments.length === 0 || p.instruments.includes(instrument.toLowerCase());
}

/** Products grouped by category, in category order, skipping empty ones. */
export function groupByCategory<T extends Pick<StoreProduct, "category" | "sort_order" | "name">>(
  products: T[],
): { category: string; label: string; items: T[] }[] {
  return STORE_CATEGORIES.map((c) => ({
    category: c.value,
    label: c.label,
    items: products
      .filter((p) => p.category === c.value)
      .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)),
  })).filter((g) => g.items.length > 0);
}

/** The tracked link a Buy button goes through. */
export function buyHref(productId: string, teacherId: string): string {
  return `/api/store/go/${productId}?t=${teacherId}`;
}

/** ISO timestamp for n days ago (click counts). */
export function daysAgoISO(days: number): string {
  return new Date(Date.now() - days * 86400_000).toISOString();
}
