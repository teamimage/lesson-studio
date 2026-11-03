import { NextResponse } from "next/server";
import { getViewer } from "@/lib/auth";
import { writePeriodReview } from "@/lib/practice/period";

// Writing a lesson-to-lesson practice review is one short Claude call.
export const maxDuration = 300;

// Called by the review page, the Home practice page and the student page (for
// the period that just ended), and the lesson page when the next lesson
// starts. Row-level security limits it to the student's family and teacher.
export async function POST(req: Request) {
  await getViewer();
  const body = (await req.json().catch(() => null)) as { studentId?: string; start?: string } | null;
  if (!body?.studentId || !body.start || !/^\d{4}-\d{2}-\d{2}$/.test(body.start)) {
    return NextResponse.json({ ok: false, error: "bad request" }, { status: 400 });
  }
  const result = await writePeriodReview(body.studentId, body.start);
  return NextResponse.json(result);
}
