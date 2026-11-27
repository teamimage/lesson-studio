import { NextResponse } from "next/server";
import { getViewer } from "@/lib/auth";
import { writeTakeaways } from "@/lib/takeaways/data";

// Writing the "Main takeaways" box is one short Claude call.
export const maxDuration = 300;

// Called by the student page (teacher and family) when the box is missing or
// out of date, and by "Write again". Row-level security limits it to the
// student's teacher and family.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await getViewer();
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { force?: boolean } | null;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ ok: false, error: "bad request" }, { status: 400 });
  return NextResponse.json(await writeTakeaways(id, body?.force === true));
}
