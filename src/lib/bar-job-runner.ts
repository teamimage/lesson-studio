import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { runStep } from "@/lib/ai/bar-job";
import type { Db } from "@/lib/ai/number-bars";

// Carries a bar map job from step to step on the server (see bar-job.ts).
// Each step runs after its request has been answered, then asks the server
// for the next step at /api/jobs/bar-map. That request has no cookies, so it
// brings the teacher's access token and uses it for the database: the same
// rules apply as when the teacher is signed in. The token isn't refreshed
// here (that would sign the browser out); if it runs out mid-job, the job
// waits and opening the Bar map page carries it on.

export const MAX_HOPS = 200;

export type StepRequest = { scoreId: string; run: string; token: string; hop: number };

/** A database client acting as the user whose access token this is. */
export function tokenClient(token: string): Db {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    },
  );
}

/** Runs one step, then asks for the next one if there's more to do. */
export async function stepAndContinue(origin: string, db: Db, teacherId: string, req: StepRequest) {
  let more = false;
  try {
    more = await runStep(db, teacherId, req.scoreId, req.run);
  } catch (e) {
    // The job stays "running" and is carried on when the page is opened again.
    console.error("bar job step", req.scoreId, e);
    return;
  }
  if (!more || req.hop + 1 >= MAX_HOPS) return;
  try {
    const res = await fetch(`${origin}/api/jobs/bar-map`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...req, hop: req.hop + 1 } satisfies StepRequest),
    });
    if (!res.ok) console.error("bar job: next step refused", req.scoreId, res.status);
  } catch (e) {
    console.error("bar job: couldn't ask for the next step", req.scoreId, e);
  }
}
