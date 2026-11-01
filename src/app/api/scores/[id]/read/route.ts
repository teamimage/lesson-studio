import { NextResponse } from "next/server";
import { requireTeacher } from "@/lib/auth";
import { readScore } from "@/lib/ai/read-music";

// Claude looking through a whole book can take a minute or two.
export const maxDuration = 300;

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { teacher } = await requireTeacher();
  const { id } = await params;
  return NextResponse.json(await readScore(teacher.id, id));
}
