import { NextResponse } from "next/server";
import { getViewer, requireTeacher } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { syncStream } from "@/lib/recording-stream";
import { signedHlsUrl, streamingEnabled } from "@/lib/stream";

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET: a short-lived signed address for the streaming copy, for anyone who
 * can see the recording (its teacher, or a parent once the lesson is
 * approved; row-level security decides). { url: null } means play the
 * original instead.
 */
export async function GET(_req: Request, { params }: Ctx) {
  await getViewer();
  const { id } = await params;
  if (!streamingEnabled()) return NextResponse.json({ url: null });
  const supabase = await createClient();
  const { data: rec } = await supabase
    .from("recordings")
    .select("stream_uid, stream_status, stream_hls_url")
    .eq("id", id)
    .maybeSingle();
  if (!rec?.stream_uid || rec.stream_status !== "ready") return NextResponse.json({ url: null });
  try {
    return NextResponse.json({ url: await signedHlsUrl(rec.stream_uid, rec.stream_hls_url) });
  } catch {
    return NextResponse.json({ url: null });
  }
}

/** POST: start or check on the streaming copy (teachers only). */
export async function POST(req: Request, { params }: Ctx) {
  await requireTeacher();
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { retry?: boolean };
  const supabase = await createClient();
  const { data: rec } = await supabase.from("recordings").select("*").eq("id", id).maybeSingle();
  if (!rec) return NextResponse.json({ status: "error", percent: null, error: "Recording not found." }, { status: 404 });
  return NextResponse.json(await syncStream(rec, { retry: !!body.retry }));
}
