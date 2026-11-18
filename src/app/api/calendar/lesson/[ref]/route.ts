import { capitalize } from "@/lib/format";
import { buildCalendar } from "@/lib/ics";
import { type Slot, type SlotChange, occurrencesBetween, parseOccurrenceRef } from "@/lib/schedule";
import { DEFAULT_SETTINGS } from "@/lib/schedule-data";
import { createClient } from "@/lib/supabase/server";

// "Add to my calendar" for one lesson: a one-event .ics file the phone hands
// to its calendar app. Signed-in teachers and parents only; the database
// rules decide which lessons each can read.

export async function GET(request: Request, { params }: { params: Promise<{ ref: string }> }) {
  const parsed = parseOccurrenceRef((await params).ref);
  if (!parsed) return new Response("Not found", { status: 404 });
  const supabase = await createClient();

  let slots: Slot[] = [];
  let changes: SlotChange[] = [];
  let date: string;
  let studentId: string;
  if ("changeId" in parsed) {
    const { data } = await supabase.from("lesson_slot_changes").select("*").eq("id", parsed.changeId).maybeSingle();
    if (!data) return new Response("Not found", { status: 404 });
    changes = [data as SlotChange];
    date = data.on_date;
    studentId = data.student_id;
  } else {
    const { data: slot } = await supabase.from("lesson_slots").select("*").eq("id", parsed.slotId).maybeSingle();
    if (!slot) return new Response("Not found", { status: 404 });
    const { data: change } = await supabase
      .from("lesson_slot_changes")
      .select("*")
      .eq("slot_id", slot.id)
      .eq("on_date", parsed.date)
      .maybeSingle();
    slots = [slot as Slot];
    changes = change ? [change as SlotChange] : [];
    date = change?.kind === "move" && change.new_date ? change.new_date : parsed.date;
    studentId = slot.student_id;
  }

  const occ = occurrencesBetween(slots, changes, date, date).find((o) => o.studentId === studentId);
  if (!occ) return new Response("Not found", { status: 404 });
  const { data: student } = await supabase.from("students").select("name, instrument, teacher_id").eq("id", studentId).maybeSingle();
  const { data: teacher } = student
    ? await supabase.from("teachers").select("name, time_zone").eq("id", student.teacher_id).maybeSingle()
    : { data: null };

  const name = student?.name ?? "Lesson";
  const ics = buildCalendar(name, [
    {
      uid: `${occ.key.replace(":", "-")}@lesson-studio`,
      occ,
      timeZone: (teacher as { time_zone?: string } | null)?.time_zone || DEFAULT_SETTINGS.timeZone,
      summary: `${name}${student ? ` · ${capitalize(student.instrument)} lesson` : ""}${teacher?.name ? ` with ${teacher.name}` : ""}`,
      url: new URL(request.url).origin,
    },
  ]);
  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="lesson-${occ.date}.ics"`,
    },
  });
}
