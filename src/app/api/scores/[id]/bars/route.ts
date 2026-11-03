import { after, NextResponse } from "next/server";
import { requireTeacher } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { readJob, startJob, viewJob } from "@/lib/ai/bar-job";
import { parseBarMap } from "@/lib/bar-map";
import { stepAndContinue, tokenClient } from "@/lib/bar-job-runner";

// The bar map job of one score. POST starts it (or carries on one that was
// cut off) and answers at once: the work goes on on the server, step by step,
// whether or not the page stays open. GET is how the page follows along.
export const maxDuration = 300;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireTeacher();
  const { id } = await params;
  const db = await createClient();
  const { data: score } = await db.from("scores").select("analysis, pages").eq("id", id).maybeSingle();
  if (!score) return NextResponse.json({ status: "none", progress: 0, stale: false });
  const job = viewJob(readJob(score.analysis));
  // Once it's done, the page takes the new map from here.
  const map =
    job.status === "done"
      ? parseBarMap(Array.isArray(score.pages) ? (score.pages as Record<string, unknown>[]) : [])
      : undefined;
  return NextResponse.json({ ...job, map });
}

/** Body: { resume?: true } — resume only carries on a job that was cut off. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { teacher } = await requireTeacher();
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { resume?: boolean } | null;
  const db = await createClient();
  const { data } = await db.auth.getSession();
  const token = data.session?.access_token ?? "";
  if (!token) return NextResponse.json({ ok: false, error: "Sign in again, then try again." });
  const out = await startJob(db, id, body?.resume === true);
  if (!out.ok) return NextResponse.json(out);
  if (out.go) {
    const origin = new URL(req.url).origin;
    // Every step, this first one too, works with the access token alone, so
    // nothing after this answer touches the browser's sign-in.
    after(() => stepAndContinue(origin, tokenClient(token), teacher.id, { scoreId: id, run: out.run, token, hop: 0 }));
  }
  return NextResponse.json({ ok: true, job: out.job });
}
