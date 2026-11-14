"use server";

import { getViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Thumbs up (1), down (-1) or cleared (0) on the quote shown that day. */
export async function rateQuote(day: string, vote: number): Promise<boolean> {
  if (!ISO_DATE.test(day) || ![-1, 0, 1].includes(vote)) return false;
  const { userId } = await getViewer();
  const supabase = await createClient();
  const { error } = await supabase
    .from("quote_history")
    .update({ vote: vote === 0 ? null : vote, voted_at: vote === 0 ? null : new Date().toISOString() })
    .eq("user_id", userId)
    .eq("shown_on", day);
  return !error;
}
