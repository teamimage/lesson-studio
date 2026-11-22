import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getViewer } from "@/lib/auth";
import { lessonAudioForPractice, lessonToPractice, practicesToLesson, practiceToLesson } from "@/lib/convert";

// Switching a recording between lesson and practice. Reviewing or drafting
// it with Claude can take a minute or two, hence a route with a long limit.
export const maxDuration = 300;

type Body =
  | { kind: "lesson-audio"; lessonId: string }
  | { kind: "lesson-to-practice"; lessonId: string; activity?: unknown; review?: boolean }
  | { kind: "practice-to-lesson"; sessionId: string }
  | { kind: "practices-to-lesson"; sessionIds: string[]; lessonId?: string | null };

const ID = /^[0-9a-f-]{36}$/;

export async function POST(req: Request) {
  const viewer = await getViewer();
  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body) return NextResponse.json({ ok: false, error: "Bad request." }, { status: 400 });

  if (body.kind === "practices-to-lesson") {
    const ids = Array.isArray(body.sessionIds) ? body.sessionIds.map(String) : [];
    if (ids.some((x) => !ID.test(x)) || (body.lessonId && !ID.test(body.lessonId)) || (!ids.length && !body.lessonId))
      return NextResponse.json({ ok: false, error: "Bad request." }, { status: 400 });
    if (!viewer.teacher) return NextResponse.json({ ok: false, error: "Only the teacher can make a lesson." });
    const out = await practicesToLesson(ids, body.lessonId ?? null);
    revalidateAll();
    return NextResponse.json(out);
  }

  if (body.kind === "practice-to-lesson") {
    if (!ID.test(body.sessionId)) return NextResponse.json({ ok: false, error: "Bad request." }, { status: 400 });
    if (!viewer.teacher) return NextResponse.json({ ok: false, error: "Only the teacher can turn a practice into a lesson." });
    const out = await practiceToLesson(body.sessionId);
    revalidateAll();
    return NextResponse.json(out);
  }

  if (!ID.test(body.lessonId)) return NextResponse.json({ ok: false, error: "Bad request." }, { status: 400 });
  if (!viewer.teacher) return NextResponse.json({ ok: false, error: "Only the teacher can change a lesson." });
  if (body.kind === "lesson-audio") return NextResponse.json(await lessonAudioForPractice(body.lessonId));
  if (body.kind === "lesson-to-practice") {
    const out = await lessonToPractice(body.lessonId, body.activity ?? [], { review: body.review !== false });
    revalidateAll();
    return NextResponse.json(out);
  }
  return NextResponse.json({ ok: false, error: "Bad request." }, { status: 400 });
}

// Lessons and practice show on most pages (calendars, lists, Downbeat).
function revalidateAll() {
  revalidatePath("/", "layout");
}
