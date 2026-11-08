"use server";

import { redirect } from "next/navigation";
import { deleteStream } from "@/lib/stream";
import { revalidatePath } from "next/cache";
import { requireTeacher } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Enums } from "@/lib/supabase/types";
import { Constants } from "@/lib/supabase/types";
import { todayISO } from "@/lib/format";
import { isNoteSection, isTextSection, type SectionProposal, type TextSection } from "@/lib/note-sections";

export type PieceInput = {
  title: string;
  activity: Enums<"piece_activity">;
  notes: string;
};
export type AssignmentInput = {
  /** Existing row id when editing, so parents' checkmarks survive. */
  id?: string;
  kind: Enums<"assignment_kind">;
  title: string;
  how: string;
  every_day: boolean;
  /** Listening items: the reference recording to play, and plays a day. */
  reference_recording_id?: string | null;
  listen_times?: number | null;
};
export type LessonInput = {
  student_id: string;
  lesson_date: string;
  duration_minutes: number | null;
  /** True when the teacher changed Minutes in the form: their length is kept over the video's. */
  duration_touched?: boolean;
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
  return parsePayloadObject(JSON.parse(String(fd.get("payload") ?? "{}")) as Partial<LessonInput>);
}

function parsePayloadObject(raw: Partial<LessonInput>): LessonInput {
  const activities = Constants.public.Enums.piece_activity;
  const kinds = Constants.public.Enums.assignment_kind;
  return {
    student_id: clean(raw.student_id),
    lesson_date: clean(raw.lesson_date) || todayISO(),
    duration_minutes:
      raw.duration_minutes && Number.isFinite(Number(raw.duration_minutes)) ? Number(raw.duration_minutes) : null,
    duration_touched: raw.duration_touched === true,
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
        id: typeof a.id === "string" && /^[0-9a-f-]{36}$/.test(a.id) ? a.id : undefined,
        kind: kinds.includes(a.kind as never) ? (a.kind as Enums<"assignment_kind">) : "piece",
        title: clean(a.title),
        how: clean(a.how),
        every_day: a.every_day !== false,
        reference_recording_id:
          a.kind === "listening" &&
          typeof a.reference_recording_id === "string" &&
          /^[0-9a-f-]{36}$/.test(a.reference_recording_id)
            ? a.reference_recording_id
            : null,
        listen_times:
          a.kind === "listening" && Number.isInteger(Number(a.listen_times)) && Number(a.listen_times) > 0
            ? Math.min(20, Number(a.listen_times))
            : null,
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
  const intent = String(fd.get("intent") ?? "draft");
  const approve = intent === "approve";
  if (!input.student_id) redirect("/");

  const base = {
    student_id: input.student_id,
    teacher_id: teacher.id,
    lesson_date: input.lesson_date,
    duration_minutes: input.duration_minutes,
    summary: orNull(input.summary),
    focus_points: orNull(input.focus_points),
    // Teacher-only: "" (not null) clears them in the private table.
    suggestions: input.suggestions,
    teacher_notes: input.teacher_notes,
    parent_message: orNull(input.parent_message),
    next_lesson_date: input.next_lesson_date,
  };

  // Minutes left as they were keep the length the app set (from the video,
  // the timer or the last lesson), even if the video changed it meanwhile.
  const { duration_minutes, ...rest } = base;
  let id = lessonId;
  if (id) {
    const { error } = await supabase
      .from("lessons")
      .update(input.duration_touched ? base : rest)
      .eq("id", id);
    if (error) redirect(`/lessons/${id}/edit?error=save`);
    await supabase.from("lesson_pieces").delete().eq("lesson_id", id);
  } else {
    const { data, error } = await supabase.from("lessons").insert(base).select("id").single();
    if (error || !data) redirect(`/students/${input.student_id}/lessons/new?error=save`);
    id = data.id;
  }
  const source = input.duration_touched
    ? duration_minutes != null
      ? "manual"
      : null
    : !lessonId && duration_minutes != null
      ? "schedule"
      : undefined;
  // Best effort: the column comes with lesson-length-source.sql.
  if (source !== undefined) await supabase.from("lessons").update({ duration_source: source }).eq("id", id);

  await writePieces(supabase, id, input.pieces);
  await writeAssignments(supabase, id, input.student_id, input.assignments);

  if (approve) await approveById(id);
  else if (intent === "update") await syncRepertoire(id);

  revalidateLesson(id, input.student_id);
  redirect(`/lessons/${id}${approve ? "?approved=1" : ""}`);
}

type Db = Awaited<ReturnType<typeof createClient>>;

// Pieces are replaced (the caller deletes the old rows first).
async function writePieces(supabase: Db, id: string, pieces: PieceInput[]) {
  if (!pieces.length) return;
  await supabase.from("lesson_pieces").insert(
    pieces.map((p, i) => ({
      lesson_id: id,
      title: p.title,
      activity: p.activity,
      notes: orNull(p.notes),
      sort_order: i + 1,
    })),
  );
}

// Assignments are updated in place where possible: practice logs point at
// their ids, and a re-insert would lose the family's checkmarks.
async function writeAssignments(supabase: Db, id: string, studentId: string, assignments: AssignmentInput[]) {
  const { data: existingRows } = await supabase.from("assignments").select("id").eq("lesson_id", id);
  const existing = new Set((existingRows ?? []).map((r) => r.id));
  const keep = new Set<string>();
  const inserts = [];
  for (const [i, a] of assignments.entries()) {
    const row = {
      lesson_id: id,
      student_id: studentId,
      kind: a.kind,
      title: a.title,
      how: orNull(a.how),
      every_day: a.every_day,
      sort_order: i + 1,
      reference_recording_id: a.reference_recording_id ?? null,
      listen_times: a.listen_times ?? null,
    };
    if (a.id && existing.has(a.id)) {
      keep.add(a.id);
      const { error } = await supabase.from("assignments").update(row).eq("id", a.id);
      if (error && missingListenColumns(error)) await supabase.from("assignments").update(withoutListen(row)).eq("id", a.id);
    } else {
      inserts.push(row);
    }
  }
  const stale = [...existing].filter((x) => !keep.has(x));
  if (stale.length) await supabase.from("assignments").delete().in("id", stale);
  if (inserts.length) {
    const { error } = await supabase.from("assignments").insert(inserts);
    if (error && missingListenColumns(error)) await supabase.from("assignments").insert(inserts.map(withoutListen));
  }
}

// Until reference-recordings.sql is run the listening columns don't exist;
// lessons still save, just without the recording link.
function missingListenColumns(error: { code?: string; message?: string }): boolean {
  return error.code === "42703" || error.code === "PGRST204" || /listen_times|reference_recording_id/.test(error.message ?? "");
}
function withoutListen<T extends { reference_recording_id?: unknown; listen_times?: unknown }>(row: T) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { reference_recording_id, listen_times, ...rest } = row;
  return rest;
}

/**
 * Saves one section of a lesson after the teacher accepted a change they
 * dictated or typed on the lesson page (see components/voice-edit.tsx).
 */
export async function saveLessonSection(
  lessonId: string,
  proposal: SectionProposal,
): Promise<{ ok: true } | { error: string }> {
  await requireTeacher();
  const supabase = await createClient();
  const { data: lesson } = await supabase
    .from("lessons")
    .select("id, student_id, status")
    .eq("id", lessonId)
    .maybeSingle();
  if (!lesson) return { error: "Lesson not found." };
  const section = proposal?.section;
  if (!isNoteSection(section)) return { error: "Unknown section." };

  if (proposal.section === "pieces") {
    const raw = { pieces: proposal.pieces } as unknown as Partial<LessonInput>;
    const { pieces } = parsePayloadObject(raw);
    const { error } = await supabase.from("lesson_pieces").delete().eq("lesson_id", lessonId);
    if (error) return { error: "Couldn't save. Try again." };
    await writePieces(supabase, lessonId, pieces);
    if (lesson.status === "approved") await syncRepertoire(lessonId);
  } else if (proposal.section === "assignments") {
    const raw = { assignments: proposal.assignments } as unknown as Partial<LessonInput>;
    const { assignments } = parsePayloadObject(raw);
    // A rewrite keeps each listening item's recording (matched by id, else title).
    const { data: before } = await supabase.from("assignments").select("*").eq("lesson_id", lessonId);
    for (const a of assignments) {
      if (a.kind !== "listening" || a.reference_recording_id) continue;
      const old = (before ?? []).find((b) => (a.id && b.id === a.id) || b.title.toLowerCase() === a.title.toLowerCase());
      if (old?.reference_recording_id) {
        a.reference_recording_id = old.reference_recording_id;
        a.listen_times ??= old.listen_times;
      }
    }
    await writeAssignments(supabase, lessonId, lesson.student_id, assignments);
  } else if (isTextSection(proposal.section)) {
    const { error } = await supabase
      .from("lessons")
      .update({
        [proposal.section]:
          proposal.section === "teacher_notes" || proposal.section === "suggestions"
            ? clean(proposal.text) // "" clears a teacher-only note (private-notes.sql)
            : orNull(clean(proposal.text)),
      } as Partial<Record<TextSection, string | null>>)
      .eq("id", lessonId);
    if (error) return { error: "Couldn't save. Try again." };
  }
  revalidateLesson(lessonId, lesson.student_id);
  return { ok: true };
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
  // Streaming copies are billed by Cloudflare, so remove them with the
  // lesson. The original files stay in storage and show under Settings ->
  // Admin -> Storage as videos with no lesson, to delete for good there.
  const { data: recs } = await supabase.from("recordings").select("stream_uid").eq("lesson_id", id);
  await Promise.all((recs ?? []).flatMap((r) => (r.stream_uid ? [deleteStream(r.stream_uid)] : [])));
  await supabase.from("lessons").delete().eq("id", id);
  revalidateLesson(id, studentId);
  redirect(studentId ? `/students/${studentId}` : "/");
}

// Approving publishes the record to parents and syncs the repertoire list.
async function approveById(id: string) {
  const supabase = await createClient();

  await supabase
    .from("lessons")
    .update({ status: "approved", approved_at: new Date().toISOString() })
    .eq("id", id);
  await syncRepertoire(id);
}

// Every piece named in the lesson gets (or updates) a repertoire row.
async function syncRepertoire(id: string) {
  const supabase = await createClient();
  const { data: lesson } = await supabase
    .from("lessons")
    .select("id, student_id, lesson_date, lesson_pieces(*)")
    .eq("id", id)
    .maybeSingle();
  if (!lesson) return;

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
