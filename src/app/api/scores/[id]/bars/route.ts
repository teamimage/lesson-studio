import { NextResponse } from "next/server";
import { requireTeacher } from "@/lib/auth";
import { numberBars, type DetectedPage } from "@/lib/ai/number-bars";

// Claude numbering the bars of a whole book can take a minute or two.
export const maxDuration = 300;

/** Body: { pages: [{ page, lines }] } — the lines and bar lines the browser found on each page. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { teacher } = await requireTeacher();
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { pages?: DetectedPage[] } | null;
  return NextResponse.json(await numberBars(teacher.id, id, body?.pages ?? []));
}
