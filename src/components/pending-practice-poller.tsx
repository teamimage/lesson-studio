"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// A practice review moves forward only while some open page asks it to
// (POST /api/practice/[id]). The practice calendars ask too, for any session
// on screen still being transcribed or reviewed, so a practice finishes even
// when nobody opens its own page. When one is done the page refreshes and
// the day turns from "processing" to its grade.

const EVERY_MS = 8000;
const GIVE_UP_MS = 30 * 60 * 1000;

export function PendingPracticePoller({ ids }: { ids: string[] }) {
  const router = useRouter();
  const key = ids.join(",");
  useEffect(() => {
    if (!key) return;
    let stop = false;
    const started = Date.now();
    const left = new Set(key.split(","));
    async function poll() {
      while (!stop && left.size && Date.now() - started < GIVE_UP_MS) {
        await new Promise((r) => setTimeout(r, EVERY_MS));
        if (stop) return;
        let changed = false;
        for (const id of [...left]) {
          const res = await fetch(`/api/practice/${id}`, { method: "POST" }).catch(() => null);
          const body = (await res?.json().catch(() => null)) as { status?: string } | null;
          if (res?.status === 404 || body?.status === "done" || body?.status === "error") {
            left.delete(id);
            changed = true;
          }
        }
        if (changed && !stop) router.refresh();
      }
    }
    poll();
    return () => {
      stop = true;
    };
  }, [key, router]);
  return null;
}
