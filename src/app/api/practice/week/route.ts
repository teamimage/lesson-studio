import { NextResponse } from "next/server";
import { getViewer } from "@/lib/auth";
import { writeWeekReview } from "@/lib/practice/week";

// Writing a weekly review is one short Claude call.
export const maxDuration = 300;

// Called by the weekly review page (and the Home practice page for last
// week). Row-level security limits it to the student's family and teacher.
export async function POST(req: Request) {
  await getViewer();
  const body = (await req.json().catch(() => null)) as { studentId?: string; weekStart?: string } | null;
  if (!body?.studentId || !body.weekStart || !/^\d{4}-\d{2}-\d{2}$/.test(body.weekStart)) {
    return NextResponse.json({ ok: false, error: "bad request" }, { status: 400 });
  }
  const result = await writeWeekReview(body.studentId, body.weekStart);
  return NextResponse.json(result);
}
