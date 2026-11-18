import "server-only";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

// Calendar subscription links (table calendar_feeds, admin/schedule-foundation.sql).
// One live link per person and kind: "teacher" (all their students) or
// "family" (their own children). Resetting makes a new link and the old one
// stops working at once.

export type FeedKind = "teacher" | "family";

export type FeedLinks = {
  /** https address: paste into Outlook or any calendar's "subscribe from web". */
  https: string;
  /** webcal:// address: opens Apple Calendar (and most phone calendars) ready to subscribe. */
  webcal: string;
  /** Opens Google Calendar's "add by URL" with the link filled in. */
  google: string;
};

/** The person's live link, or null (none yet, or schedule-foundation.sql not run: `ready` false). */
export async function getMyFeed(kind: FeedKind): Promise<{ ready: boolean; token: string | null; lastReadAt: string | null }> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const uid = claims?.claims?.sub as string | undefined;
  if (!uid) return { ready: false, token: null, lastReadAt: null };
  const { data, error } = await supabase
    .from("calendar_feeds")
    .select("token, last_read_at")
    .eq("user_id", uid)
    .eq("kind", kind)
    .is("revoked_at", null)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) return { ready: false, token: null, lastReadAt: null };
  return { ready: true, token: data?.[0]?.token ?? null, lastReadAt: data?.[0]?.last_read_at ?? null };
}

/** The site's own address, from the request. */
export async function siteOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "lesson-studio-theta.vercel.app";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export function feedLinks(origin: string, token: string): FeedLinks {
  const https = `${origin}/api/calendar/feed/${token}.ics`;
  const webcal = https.replace(/^https?:\/\//, "webcal://");
  return {
    https,
    webcal,
    google: `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`,
  };
}
