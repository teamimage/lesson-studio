import { NextResponse } from "next/server";
import { getViewer } from "@/lib/auth";
import { advance } from "@/lib/practice/process";

// Reviewing a long practice with Claude can take a minute or two.
export const maxDuration = 300;

// Polled by any page showing an unfinished practice session. Row-level
// security limits it to the student's family and teacher.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await getViewer();
  const { id } = await params;
  const state = await advance(id);
  if (!state) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(state);
}
