import { addDays, capitalize, todayISO } from "@/lib/format";
import { buildCalendar, type IcsEvent } from "@/lib/ics";
import { type Closure, type Slot, type SlotChange, fallbackSlot, occurrencesBetween, occurrenceRef } from "@/lib/schedule";
import { createClient } from "@/lib/supabase/server";

// A calendar subscription link: every lesson from two months back to a year
// ahead, for Google Calendar, Outlook, Apple Calendar and anything else that
// subscribes to an .ics address. No sign-in: the long secret token is the
// key, and resetting the link turns the old one off.

type Feed = {
  kind: "teacher" | "family";
  students: { id: string; name: string; instrument: string; teacher_id: string; lesson_day: string | null; lesson_time: string | null }[];
  teachers: { id: string; name: string; studio_name: string; time_zone: string }[];
  slots: Slot[];
  changes: SlotChange[];
  closures: Closure[];
};

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token: raw } = await params;
  const token = raw.replace(/\.ics$/i, "");
  if (!/^[0-9a-f]{32,128}$/i.test(token)) return new Response("Not found", { status: 404 });

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("calendar_feed", { p_token: token });
  if (error || !data) return new Response("This calendar link has been turned off.", { status: 404 });
  const feed = data as unknown as Feed;

  const origin = new URL(request.url).origin;
  const today = todayISO();
  const from = addDays(today, -60);
  const to = addDays(today, 365);
  const teacherOf = new Map(feed.teachers.map((t) => [t.id, t]));
  const studentOf = new Map(feed.students.map((s) => [s.id, s]));
  const withSlot = new Set(feed.slots.map((s) => s.student_id));
  const slots = [
    ...feed.slots,
    ...feed.students.filter((s) => !withSlot.has(s.id)).map(fallbackSlot).filter((s): s is Slot => !!s),
  ];

  const events: IcsEvent[] = [];
  for (const teacher of feed.teachers) {
    const mine = (x: { student_id: string }) => studentOf.get(x.student_id)?.teacher_id === teacher.id;
    const occs = occurrencesBetween(
      slots.filter(mine),
      feed.changes.filter(mine),
      from,
      to,
      feed.closures.filter((c) => c.teacher_id === teacher.id),
    );
    for (const o of occs) {
      const s = studentOf.get(o.studentId);
      if (!s) continue;
      const t = teacherOf.get(s.teacher_id);
      const ref = occurrenceRef(o);
      events.push({
        uid: `${o.key.replace(":", "-")}@lesson-studio`,
        occ: o,
        timeZone: t?.time_zone || "America/New_York",
        summary:
          feed.kind === "teacher"
            ? `${s.name} · ${capitalize(s.instrument)}`
            : `${s.name.split(" ")[0]}'s ${s.instrument} lesson${t?.name ? ` with ${t.name}` : ""}`,
        url: feed.kind === "teacher" ? (ref ? `${origin}/schedule/${ref}` : `${origin}/students/${s.id}`) : `${origin}/family/${s.id}`,
      });
    }
  }

  const studio = feed.teachers[0]?.studio_name || feed.teachers[0]?.name || "";
  const name =
    feed.kind === "teacher"
      ? `Lessons${studio ? ` · ${studio}` : ""}`
      : `${feed.students.map((s) => s.name.split(" ")[0]).join(" & ") || "Our"} lessons`;

  return new Response(buildCalendar(name, events), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="lessons.ics"',
      "Cache-Control": "private, max-age=300",
    },
  });
}
