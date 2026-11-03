import { NextResponse } from "next/server";
import { requireTeacher } from "@/lib/auth";
import { getLesson } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { MissingKeyError, transcribeClip } from "@/lib/ai/assemblyai";
import { TRANSCRIPTION_MODEL, transcriptionCost } from "@/lib/ai/pricing";

// A spoken change to the lesson notes: the browser records a short clip,
// this turns it into text (AssemblyAI) for the teacher to check before
// Claude applies it. The clip itself isn't kept.
export const maxDuration = 60;

const MAX_BYTES = 4_000_000;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { teacher } = await requireTeacher();
  const { id } = await params;
  const lesson = await getLesson(id);
  if (!lesson) return NextResponse.json({ error: "Lesson not found." }, { status: 404 });

  const audio = await req.arrayBuffer();
  if (audio.byteLength < 1000) return NextResponse.json({ error: "Nothing was recorded. Try again." }, { status: 400 });
  if (audio.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: "That recording is too long. Keep it under two minutes." }, { status: 413 });
  }

  // Piece titles help it spell what the teacher says.
  const keyterms = [...lesson.lesson_pieces.map((p) => p.title), ...lesson.assignments.map((a) => a.title)].filter(
    (t) => t.length <= 50,
  );
  try {
    const { text, audioSeconds } = await transcribeClip(audio, keyterms);
    const db = await createClient();
    await db.from("ai_usage").insert({
      teacher_id: teacher.id,
      lesson_id: id,
      kind: "transcription",
      provider: "assemblyai",
      model: TRANSCRIPTION_MODEL,
      audio_seconds: audioSeconds,
      cost_usd: Math.round(transcriptionCost(audioSeconds) * 1_000_000) / 1_000_000,
    });
    if (!text) return NextResponse.json({ error: "No words were heard. Try again, closer to the mic." }, { status: 422 });
    return NextResponse.json({ text });
  } catch (e) {
    const message = e instanceof MissingKeyError || e instanceof Error ? e.message : "Transcription failed.";
    return NextResponse.json({ error: message.slice(0, 300) }, { status: 502 });
  }
}
