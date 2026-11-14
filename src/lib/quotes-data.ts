import "server-only";
import { createClient } from "@/lib/supabase/server";
import { todayISO } from "@/lib/format";
import { type HistoryRow, type Quote, pickQuote, quoteById } from "@/lib/quotes";

export type TodayQuote = {
  quote: Quote;
  day: string;
  vote: -1 | 0 | 1;
  /** False until quote-history SQL is run: the quote still shows, thumbs don't. */
  ready: boolean;
};

/**
 * Today's quote for the signed-in user. The first visit of the day picks it
 * from the user's history and saves it, so it stays the same all day on
 * every device.
 */
export async function loadTodayQuote(userId: string): Promise<TodayQuote> {
  const day = todayISO();
  const seed = `${userId}:${day}`;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("quote_history")
    .select("quote_id, shown_on, vote")
    .eq("user_id", userId)
    .order("shown_on", { ascending: false })
    .limit(500);
  if (error) return { quote: pickQuote([], seed, day), day, vote: 0, ready: false };

  const rows = (data ?? []) as HistoryRow[];
  const saved = rows.find((r) => r.shown_on === day);
  const savedQuote = saved ? quoteById(saved.quote_id) : null;
  if (saved && savedQuote) return { quote: savedQuote, day, vote: toVote(saved.vote), ready: true };

  const quote = pickQuote(rows.filter((r) => r.shown_on !== day), seed, day);
  await supabase
    .from("quote_history")
    .upsert({ user_id: userId, shown_on: day, quote_id: quote.id }, { onConflict: "user_id,shown_on" });
  return { quote, day, vote: 0, ready: true };
}

const toVote = (v: number | null): -1 | 0 | 1 => (v === 1 ? 1 : v === -1 ? -1 : 0);
