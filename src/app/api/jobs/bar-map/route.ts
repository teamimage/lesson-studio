import { after, NextResponse } from "next/server";
import { MAX_HOPS, stepAndContinue, tokenClient, type StepRequest } from "@/lib/bar-job-runner";

// The next step of a bar map job, asked for by the server itself (see
// bar-job-runner.ts). Answers at once and does the step afterwards.
export const maxDuration = 300;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Partial<StepRequest> | null;
  const token = String(body?.token ?? "");
  const scoreId = String(body?.scoreId ?? "");
  const run = String(body?.run ?? "");
  const hop = Math.max(0, Math.round(Number(body?.hop) || 0));
  if (!token || !scoreId || !run || hop >= MAX_HOPS) return NextResponse.json({ ok: false }, { status: 400 });

  const db = tokenClient(token);
  const { data } = await db.auth.getClaims(token);
  const userId = data?.claims?.sub;
  if (!userId) return NextResponse.json({ ok: false }, { status: 401 });
  const { data: teacher } = await db.from("teachers").select("id").eq("user_id", userId).maybeSingle();
  if (!teacher) return NextResponse.json({ ok: false }, { status: 403 });

  const origin = new URL(req.url).origin;
  after(() => stepAndContinue(origin, db, teacher.id, { scoreId, run, token, hop }));
  return NextResponse.json({ ok: true }, { status: 202 });
}
