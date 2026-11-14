"use server";

import { revalidatePath } from "next/cache";
import { requireTeacher } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { todayISO } from "@/lib/format";
import { focusDb } from "@/lib/focus/data";
import { proposeFromLesson } from "@/lib/focus/propose";
import { MAX_FOCUS } from "@/lib/focus/types";

// The teacher's side of "What we're working on": she owns the list. The app
// only ever suggests.

export type FocusActionState = { error?: string; note?: string } | null;

const clean = (v: FormDataEntryValue | null, max = 240) => String(v ?? "").trim().slice(0, max);

function refresh(studentId: string) {
  revalidatePath(`/v3/students/${studentId}`);
  revalidatePath(`/v3/family/${studentId}`);
  revalidatePath(`/students/${studentId}`);
  revalidatePath(`/family/${studentId}`);
}

async function openCount(studentId: string): Promise<number> {
  const db = focusDb(await createClient());
  const { count } = await db.from("focus_items").select("id", { count: "exact", head: true }).eq("student_id", studentId).eq("state", "open");
  return count ?? 0;
}

const FULL = `Three is the limit. Park or finish one first, so the list stays short enough to remember.`;

/** Accept a suggestion (with any edits) or take a parked point back. */
export async function acceptFocus(_: FocusActionState, fd: FormData): Promise<FocusActionState> {
  await requireTeacher();
  const id = clean(fd.get("id"));
  const studentId = clean(fd.get("student_id"));
  const title = clean(fd.get("title"), 120);
  const n = await openCount(studentId);
  if (n >= MAX_FOCUS) return { error: FULL };
  const db = focusDb(await createClient());
  const patch: Record<string, unknown> = { state: "open", sort_order: n };
  if (title) patch.title = title;
  if (fd.has("parent_cue")) patch.parent_cue = clean(fd.get("parent_cue"));
  const { error } = await db.from("focus_items").update(patch).eq("id", id).eq("student_id", studentId);
  if (error) return { error: "That couldn't be saved." };
  refresh(studentId);
  return null;
}

/** The teacher's own point, typed in. */
export async function addFocus(_: FocusActionState, fd: FormData): Promise<FocusActionState> {
  await requireTeacher();
  const studentId = clean(fd.get("student_id"));
  const title = clean(fd.get("title"), 120);
  if (!title) return { error: "Write the focus point first." };
  const n = await openCount(studentId);
  if (n >= MAX_FOCUS) return { error: FULL };
  const db = focusDb(await createClient());
  const { error } = await db.from("focus_items").insert({
    student_id: studentId,
    title,
    piece: clean(fd.get("piece"), 120),
    parent_cue: clean(fd.get("parent_cue")),
    state: "open",
    opened_on: todayISO(),
    sort_order: n,
  });
  if (error) return { error: "That couldn't be saved. Has working-on.sql been run?" };
  refresh(studentId);
  return null;
}

/** Reword a point or its line for the parent. */
export async function editFocus(_: FocusActionState, fd: FormData): Promise<FocusActionState> {
  await requireTeacher();
  const id = clean(fd.get("id"));
  const studentId = clean(fd.get("student_id"));
  const title = clean(fd.get("title"), 120);
  if (!title) return { error: "The focus point needs some words." };
  const db = focusDb(await createClient());
  const { error } = await db
    .from("focus_items")
    .update({ title, parent_cue: clean(fd.get("parent_cue")) })
    .eq("id", id)
    .eq("student_id", studentId);
  if (error) return { error: "That couldn't be saved." };
  refresh(studentId);
  return null;
}

/**
 * One tap on a point: the teacher's own verdict (overrules the app), park
 * it, finish it, or throw a suggestion away.
 */
export async function markFocus(fd: FormData): Promise<void> {
  await requireTeacher();
  const id = clean(fd.get("id"));
  const studentId = clean(fd.get("student_id"));
  const what = clean(fd.get("what"));
  const db = focusDb(await createClient());
  const today = todayISO();
  if (what === "dismiss") {
    await db.from("focus_items").delete().eq("id", id).eq("student_id", studentId).eq("state", "proposed");
  } else if (what === "park") {
    await db.from("focus_items").update({ state: "watching", do_first: [] }).eq("id", id).eq("student_id", studentId);
  } else if (what === "done") {
    await db.from("focus_items").update({ state: "closed", closed_on: today }).eq("id", id).eq("student_id", studentId);
    await db.from("focus_events").insert({ focus_item_id: id, student_id: studentId, event_date: today, source: "teacher", verdict: "done" });
  } else if (what === "better" || what === "same" || what === "went_back") {
    await db.from("focus_events").insert({ focus_item_id: id, student_id: studentId, event_date: today, source: "teacher", verdict: what });
  }
  refresh(studentId);
}

/** "Suggest from the last lesson": for lessons approved before the list existed, or to ask again. */
export async function suggestFocus(_: FocusActionState, fd: FormData): Promise<FocusActionState> {
  await requireTeacher();
  const studentId = clean(fd.get("student_id"));
  const db = await createClient();
  const { data: lesson } = await db
    .from("lessons")
    .select("id")
    .eq("student_id", studentId)
    .eq("status", "approved")
    .order("lesson_date", { ascending: false })
    .order("approved_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!lesson) return { error: "There's no approved lesson to read yet." };
  const out = await proposeFromLesson(lesson.id);
  if (!out.ok) return { error: out.error };
  refresh(studentId);
  return { note: out.suggested ? "" : "Nothing new to suggest from that lesson." };
}
