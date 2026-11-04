import { NextResponse } from "next/server";
import { requireTeacher } from "@/lib/auth";
import { getLesson, getStudent } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { MissingKeyError } from "@/lib/ai/assemblyai";
import { DraftError } from "@/lib/ai/draft-lesson";
import { claudeCost, type ClaudeUsage } from "@/lib/ai/pricing";
import { reviseSection } from "@/lib/ai/revise-section";
import { teachingStyleFor } from "@/lib/ai/teaching-style";
import { isNoteSection } from "@/lib/note-sections";

// Claude rewrites one section of the lesson notes with the teacher's
// change. Returns the proposal only; the teacher accepts it to save.
export const maxDuration = 120;

type Body = { section?: unknown; instruction?: unknown };

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { teacher } = await requireTeacher();
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as Body;
  const instruction = typeof body.instruction === "string" ? body.instruction.trim().slice(0, 4000) : "";
  if (!isNoteSection(body.section)) return NextResponse.json({ error: "Unknown section." }, { status: 400 });
  if (!instruction) return NextResponse.json({ error: "Say or type what should change." }, { status: 400 });

  const lesson = await getLesson(id);
  if (!lesson) return NextResponse.json({ error: "Lesson not found." }, { status: 404 });
  const student = await getStudent(lesson.student_id);
  if (!student) return NextResponse.json({ error: "Student not found." }, { status: 404 });

  let usage: ClaudeUsage[] = [];
  try {
    const style = await teachingStyleFor(await createClient(), teacher.id);
    const out = await reviseSection(lesson, student, body.section, instruction, style);
    usage = out.usage;
    return NextResponse.json({ proposal: out.proposal });
  } catch (e) {
    if (e instanceof DraftError) usage = e.usage;
    const message =
      e instanceof MissingKeyError || e instanceof DraftError
        ? e.message
        : "Claude couldn't make the change just now. Try again.";
    return NextResponse.json({ error: message }, { status: 502 });
  } finally {
    if (usage.length) {
      const db = await createClient();
      await db.from("ai_usage").insert(
        usage.map((u) => ({
          teacher_id: teacher.id,
          lesson_id: id,
          kind: "draft",
          provider: "anthropic",
          model: u.model,
          input_tokens: u.input_tokens,
          output_tokens: u.output_tokens,
          cache_read_tokens: u.cache_read_tokens,
          cache_write_tokens: u.cache_write_tokens,
          cost_usd: Math.round(claudeCost(u) * 1_000_000) / 1_000_000,
        })),
      );
    }
  }
}
