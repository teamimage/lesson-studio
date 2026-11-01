import { NextResponse } from "next/server";
import { requireTeacher } from "@/lib/auth";
import { linkLessonMusic } from "@/lib/ai/link-music";

// Two Claude calls (transcript, then the pages); a minute or two at most.
export const maxDuration = 300;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { teacher } = await requireTeacher();
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { force?: boolean };
  return NextResponse.json(await linkLessonMusic(teacher.id, id, !!body.force));
}
