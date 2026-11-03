import { NextResponse } from "next/server";
import { requireTeacher } from "@/lib/auth";
import { transcribeNext } from "@/lib/ai/transcribe-melody";

// Reads the notes of the next few pieces in a score (a minute or so).
export const maxDuration = 300;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { teacher } = await requireTeacher();
  const { id } = await params;
  const retry = new URL(req.url).searchParams.get("retry") === "1";
  return NextResponse.json(await transcribeNext(teacher.id, id, retry));
}
