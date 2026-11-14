"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireTeacher } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { readLessons } from "@/lib/playbook/data";

// The teacher's answers to their playbook cards. Nothing is used in a
// review until it has been kept here.

export type PlaybookActionState = { error?: string; note?: string } | null;

const clean = (v: FormDataEntryValue | null, max = 400) => String(v ?? "").trim().slice(0, max);

async function cards() {
  return (await createClient()) as unknown as SupabaseClient;
}

/** Keep (with any change to the words), Not me, or take a kept card out again. */
export async function answerCard(_: PlaybookActionState, fd: FormData): Promise<PlaybookActionState> {
  const { teacher } = await requireTeacher();
  const id = clean(fd.get("id"));
  const what = clean(fd.get("what"));
  const body = clean(fd.get("body"));
  const db = await cards();
  const now = new Date().toISOString();
  const patch =
    what === "keep"
      ? { state: "kept", decided_at: now, ...(body ? { body } : {}) }
      : what === "not_me"
        ? { state: "not_me", decided_at: now }
        : null;
  if (!patch) return { error: "That answer wasn't understood." };
  if (what === "keep" && !body) return { error: "The card needs some words." };
  const { error } = await db.from("playbook_cards").update(patch).eq("id", id).eq("teacher_id", teacher.id);
  if (error) return { error: "That couldn't be saved." };
  revalidatePath("/settings/assistant");
  return null;
}

/** "Read my recent lessons": suggests up to five cards from lessons not read yet. */
export async function readMyLessons(_: PlaybookActionState, _fd: FormData): Promise<PlaybookActionState> {
  void _fd;
  const { teacher } = await requireTeacher();
  const out = await readLessons(teacher.id);
  if (!out.ok) return { error: out.error };
  revalidatePath("/settings/assistant");
  return {
    note: out.cards
      ? ""
      : `Read ${out.lessons} lesson${out.lessons === 1 ? "" : "s"} and found nothing new that you do often enough to write down.`,
  };
}
