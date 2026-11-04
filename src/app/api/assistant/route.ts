import { NextResponse } from "next/server";
import { requireTeacher } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { MissingKeyError } from "@/lib/ai/assemblyai";
import { DraftError } from "@/lib/ai/draft-lesson";
import { askAssistant, type ChatTurn } from "@/lib/ai/assistant";
import { claudeCost, type ClaudeUsage } from "@/lib/ai/pricing";
import { teachingStyleFor } from "@/lib/ai/teaching-style";
import { SECTION_IDS, SECTION_MAX_CHARS, toneOf, type TeachingProfile } from "@/lib/assistant/profile";
import type { Json } from "@/lib/supabase/types";

// One turn of the chat with the teacher's teaching assistant. An empty
// message opens (or reopens) the conversation with the next question.
export const maxDuration = 120;

const HISTORY = 30;
const SETUP_ERROR = "The teaching assistant isn't set up in Supabase yet. Run teaching-assistant.sql in the Supabase SQL Editor.";

export async function POST(req: Request) {
  const { teacher } = await requireTeacher();
  const body = (await req.json().catch(() => ({}))) as { message?: unknown };
  const message = typeof body.message === "string" ? body.message.trim().slice(0, 6000) : "";
  const db = await createClient();

  const { data: rows, error } = await db
    .from("teaching_assistant_messages")
    .select("role, content")
    .eq("teacher_id", teacher.id)
    .order("created_at", { ascending: false })
    .limit(HISTORY);
  if (error) return NextResponse.json({ error: SETUP_ERROR }, { status: 500 });
  const history = (rows ?? []).reverse() as ChatTurn[];
  const style = await teachingStyleFor(db, teacher.id);

  let usage: ClaudeUsage[] = [];
  try {
    const out = await askAssistant({ teacherName: teacher.name, tone: style.tone, profile: style.profile, history, message });
    usage = out.usage;
    const r = out.result;

    const profile: TeachingProfile = {
      v: 1,
      sections: { ...style.profile.sections },
      answered: [...new Set([...style.profile.answered, ...(r.answered ?? [])])],
      updated_at: new Date().toISOString(),
    };
    for (const u of r.updates ?? []) {
      if (!SECTION_IDS.includes(u.section)) continue;
      const text = u.text.trim().slice(0, SECTION_MAX_CHARS);
      if (text) profile.sections[u.section] = text;
      else delete profile.sections[u.section];
    }
    const tone = r.tone ? toneOf(r.tone) : style.tone;

    await db.from("teachers").update({ teaching_profile: profile as unknown as Json, review_tone: tone }).eq("id", teacher.id);
    const now = Date.now();
    await db.from("teaching_assistant_messages").insert([
      ...(message ? [{ teacher_id: teacher.id, role: "user", content: message, created_at: new Date(now).toISOString() }] : []),
      { teacher_id: teacher.id, role: "assistant", content: r.reply, created_at: new Date(now + 1).toISOString() },
    ]);
    await logUsage(db, teacher.id, usage);
    return NextResponse.json({ ok: true, reply: r.reply, profile, tone });
  } catch (e) {
    if (e instanceof DraftError) usage = e.usage;
    await logUsage(db, teacher.id, usage);
    const msg =
      e instanceof MissingKeyError || e instanceof DraftError ? e.message : "The assistant couldn't answer just now. Try again.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

async function logUsage(db: Awaited<ReturnType<typeof createClient>>, teacherId: string, usage: ClaudeUsage[]) {
  if (!usage.length) return;
  await db.from("ai_usage").insert(
    usage.map((u) => ({
      teacher_id: teacherId,
      kind: "assistant",
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
