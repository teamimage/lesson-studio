import { NextResponse } from "next/server";
import { requireTeacher } from "@/lib/auth";
import { advance, redraft, start } from "@/lib/ai/process-lesson";

// Drafting with Claude can take a minute or two for a long lesson.
export const maxDuration = 300;

type Body = { action?: string; recordingId?: string };

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { teacher } = await requireTeacher();
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as Body;
  if (body.action === "start" && body.recordingId) {
    return NextResponse.json(await start(teacher.id, id, body.recordingId));
  }
  if (body.action === "redraft") return NextResponse.json(await redraft(teacher.id, id));
  return NextResponse.json(await advance(teacher.id, id));
}
