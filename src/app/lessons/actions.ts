"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireTeacher } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Enums } from "@/lib/supabase/types";
import { Constants } from "@/lib/supabase/types";

export type PieceInput = {
  title: string;
  activity: Enums<"piece_activity">;
  notes: string;
};
export type AssignmentInput = {
  kind: Enums<"assignment_kind">;
  title: string;
  how: string;
  every_day: boolean;
};
export type LessonInput = {
  student_id: string;
  lesson_date: string;
  duration_minutes: number | null;
  summary: string;
  focus_points: string;
  suggestions: string;
  teacher_notes: string;
  parent_message: string;
  next_lesson_date: string | null;
  pieces: PieceInput[];
  assignments: AssignmentInput[];
};

function clean(s: unknown): string {
  return typeof s === "string" ? s.trim() : "";
}
function orNull(s: string): string | null {
  return s ? s : null;
}

function parsePayload(fd: FormData): LessonInput {
  const raw = JSON.parse(String(fd.get("payload") ?? "{}")) as Partial<LessonInput>;
  const activities = Constants.public.Enums.piece_activity;
  const kinds = Constants.public.Enums.assignment_kind;
  return {
    student_id: clean(raw.student_id),
    lesson_date: clean(raw.lesson_date) || new Date().toISOString().slice(0, 10),
    duration_minutes:
      raw.duration_minutes && Number.isFinite(Number(raw.duration_minutes)) ? Number(raw.duration_minutes) : null,
    summary: clean(raw.summary),
    focus_points: clean(raw.focus_points),
    suggestions: clean(raw.suggestions),
    teacher_notes: clean(raw.teacher_notes),
    parent_message: clean(raw.parent_message),
    next_lesson_date: orNull(clean(raw.next_lesson_date)),
    pieces: (raw.pieces ?? [])
      .map((p) => ({
        title: clean(p.title),
        activity: activities.includes(p.activity as never) ? (p.activity as Enums<"piece_activity">) : "worked_on",
        notes: clean(p.notes),
      }))
      .filter((p) => p.title),
    assignments: (raw.assignments ?? [])
      .map((a) => ({
        kind: kinds.includes(a.kind as never) ? (a.kind as Enums<"assignment_kind">) : "piece",
        title: clean(a.title),
        how: clean(a.how),
        every_day: a.every_day !== false,
      }))
      .filter((a) => a.title),
  };
}

// Creates or updates a lesson record. `approve` also publishes it to parents.
export async function saveLesson(fd: FormData) {
  const { teacher } = await requireTeacher();
  const supabase = await createClient();
  const input = parsePayload(fd);
  const lessonId = clean(fd.get("lesson_id"));
  const approve = fd.get("intent") === "approve";
  if (!input.student_id) redirect("/");

  const base = {
    student_id: input.student_id,
    teacher_id: teacher.id,
    lesson_date: input.lesson_date,
    duration_minutes: input.duration_minutes,
    summary: orNull(input.summary),
    focus_points: orNull(input.focus_points),
    suggestions: orNull(input.suggestions),
    teacher_notes: orNull(input.teacher_notes),
    parent_message: orNull(input.parent_message),
    next_lesson_date: input.next_lesson_date,
  };

  let id = lessonId;
  if (id) {
    const { error } = await supabase.from("lessons").update(base).eq("id", id);
    if (error) redirect(`/lessons/${id}/edit?error=save`);
    await supabase.from("lesson_pieces").delete().eq("lesson_id", id);
    await supabase.from("assignments").delete().eq("lesson_id", id);
  } else {
    const { data, error } = await supabase.from("lessons").insert(base).select("id").single();
    if (error || !data) redirect(`/students/${input.student_id}/lessons/new?error=save`);
    id = data.id;
  }

  if (input.pieces.length) {
    await supabase.from("lesson_pieces").insert(
      input.pieces.map((p, i) => ({
        lesson_id: id,
        title: p.title,
        activity: p.activity,
        notes: orNull(p.notes),
        sort_order: i + 1,
      })),
    );
  }
  if (input.assignments.length) {
    await supabase.from("assignments").insert(
      input.assignments.map((a, i) => ({
        lesson_id: id,
        student_id: input.student_id,
        kind: a.kind,
        title: a.title,
        how: orNull(a.how),
        every_day: a.every_day,
        sort_order: i + 1,
      })),
    );
  }

  if (approve) await approveById(id);

  revalidateLesson(id, input.student_id);
  redirect(`/lessons/${id}${approve ? "?approved=1" : ""}`);
}

export async function approveLesson(fd: FormData) {
  await requireTeacher();
  const id = clean(fd.get("lesson_id"));
  const studentId = clean(fd.get("student_id"));
  if (!id) redirect("/");
  await approveById(id);
  revalidateLesson(id, studentId);
  redirect(`/lessons/${id}?approved=1`);
}

export async function unapproveLesson(fd: FormData) {
  await requireTeacher();
  const id = clean(fd.get("lesson_id"));
  const studentId = clean(fd.get("student_id"));
  const supabase = await createClient();
  await supabase.from("lessons").update({ status: "draft", approved_at: null }).eq("id", id);
  revalidateLesson(id, studentId);
  redirect(`/lessons/${id}`);
}

export async function deleteLesson(fd: FormData) {
  await requireTeacher();
  const id = clean(fd.get("lesson_id"));
  const studentId = clean(fd.get("student_id"));
  const supabase = await createClient();
  await supabase.from("lessons").delete().eq("id", id);
  revalidateLesson(id, studentId);
  redirect(studentId ? `/students/${studentId}` : "/");
}

// Approving publishes the record to parents and syncs the repertoire list:
// every piece named in the lesson gets (or updates) a repertoire row.
async function approveById(id: string) {
  const supabase = await createClient();
  const { data: lesson } = await supabase
    .from("lessons")
    .select("id, student_id, lesson_date, lesson_pieces(*)")
    .eq("id", id)
    .maybeSingle();
  if (!lesson) return;

  await supabase
    .from("lessons")
    .update({ status: "approved", approved_at: new Date().toISOString() })
    .eq("id", id);

  const { data: rep } = await supabase.from("repertoire").select("*").eq("student_id", lesson.student_id);
  const byTitle = new Map((rep ?? []).map((r) => [r.title.toLowerCase(), r]));

  for (const piece of lesson.lesson_pieces) {
    const existing = byTitle.get(piece.title.toLowerCase());
    const status = statusForActivity(piece.activity, existing?.status);
    if (existing) {
      const later = !existing.last_played_on || existing.last_played_on < lesson.lesson_date;
      await supabase
        .from("repertoire")
        .update({
          status,
          last_played_on: later ? lesson.lesson_date : existing.last_played_on,
        })
        .eq("id", existing.id);
      if (!piece.repertoire_id) {
        await supabase.from("lesson_pieces").update({ repertoire_id: existing.id }).eq("id", piece.id);
      }
    } else {
      const { data: created } = await supabase
        .from("repertoire")
        .insert({
          student_id: lesson.student_id,
          title: piece.title,
          status,
          started_on: lesson.lesson_date,
          last_played_on: lesson.lesson_date,
        })
        .select("*")
        .single();
      if (created) {
        byTitle.set(created.title.toLowerCase(), created);
        await supabase.from("lesson_pieces").update({ repertoire_id: created.id }).eq("id", piece.id);
      }
    }
  }
}

function statusForActivity(
  activity: Enums<"piece_activity">,
  current: Enums<"repertoire_status"> | undefined,
): Enums<"repertoire_status"> {
  switch (activity) {
    case "started":
      return current && current !== "preview" ? current : "learning";
    case "polished":
      return current === "review" || current === "performed" ? current : "polishing";
    case "reviewed":
      return current === "performed" ? current : "review";
    case "performed":
      return "performed";
    default:
      return current ?? "learning";
  }
}

function revalidateLesson(id: string, studentId: string) {
  revalidatePath("/");
  revalidatePath("/family");
  revalidatePath(`/lessons/${id}`);
  if (studentId) {
    revalidatePath(`/students/${studentId}`);
    revalidatePath(`/family/${studentId}`);
  }
}
