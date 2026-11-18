"use server";

import { revalidatePath } from "next/cache";
import { getViewer } from "@/lib/auth";
import type { FeedKind } from "@/lib/calendar-feeds";
import { createClient } from "@/lib/supabase/server";

// Make, reset or turn off your own calendar subscription link.

function kindOf(fd: FormData, isTeacher: boolean): FeedKind | null {
  const k = String(fd.get("kind") ?? "");
  if (k === "teacher" && isTeacher) return "teacher";
  if (k === "family") return "family";
  return null;
}

function refresh(fd: FormData) {
  const back = String(fd.get("back") ?? "");
  if (back.startsWith("/") && !back.startsWith("//")) revalidatePath(back);
  revalidatePath("/settings/lesson-times");
}

/** Makes a link if there is none. With reset=1, turns the old one off first. */
export async function makeCalendarLink(fd: FormData) {
  const viewer = await getViewer();
  const kind = kindOf(fd, !!viewer.teacher);
  if (!kind) return;
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const uid = claims?.claims?.sub as string | undefined;
  if (!uid) return;
  if (fd.get("reset") === "1") {
    await supabase
      .from("calendar_feeds")
      .update({ revoked_at: new Date().toISOString() })
      .eq("user_id", uid)
      .eq("kind", kind)
      .is("revoked_at", null);
  } else {
    const { data } = await supabase
      .from("calendar_feeds")
      .select("id")
      .eq("user_id", uid)
      .eq("kind", kind)
      .is("revoked_at", null)
      .limit(1);
    if (data?.length) return refresh(fd);
  }
  await supabase.from("calendar_feeds").insert({ user_id: uid, kind });
  refresh(fd);
}

/** Turns the link off. Calendars subscribed to it stop updating and soon drop the lessons. */
export async function stopCalendarLink(fd: FormData) {
  const viewer = await getViewer();
  const kind = kindOf(fd, !!viewer.teacher);
  if (!kind) return;
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const uid = claims?.claims?.sub as string | undefined;
  if (!uid) return;
  await supabase
    .from("calendar_feeds")
    .update({ revoked_at: new Date().toISOString() })
    .eq("user_id", uid)
    .eq("kind", kind)
    .is("revoked_at", null);
  refresh(fd);
}
