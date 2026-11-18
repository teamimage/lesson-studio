import { Suspense } from "react";
import { Shell } from "@/components/shell";
import { AddLessonForm, type Booked, type Pupil } from "@/components/add-lesson-form";
import { requireTeacher } from "@/lib/auth";
import { listStudents } from "@/lib/data";
import { addDays, todayISO } from "@/lib/format";
import { isOn } from "@/lib/schedule";
import { loadSchedule, scheduleBetween } from "@/lib/schedule-data";

type SP = Promise<{ date?: string; next?: string; student?: string }>;

const ISO = /^\d{4}-\d{2}-\d{2}$/;

// Add lesson, from any calendar: pick the student, and their usual length
// fills in and blocks that much time. Lessons already booked that day are
// listed, with a warning if the new one would overlap.
export default function AddLessonPage({ searchParams }: { searchParams: SP }) {
  return (
    <Suspense fallback={<Shell title="Add lesson" tab="downbeat">{null}</Shell>}>
      <Body searchParams={searchParams} />
    </Suspense>
  );
}

async function Body({ searchParams }: { searchParams: SP }) {
  await requireTeacher();
  const sp = await searchParams;
  const today = todayISO();
  const date = sp.date && ISO.test(sp.date) ? sp.date : today;
  const next = sp.next && sp.next.startsWith("/") && !sp.next.startsWith("//") ? sp.next : "/downbeat";
  const students = (await listStudents()).filter((s) => s.active);
  const from = date < today ? date : today;
  const schedule = await loadSchedule(students, from);
  const occs = scheduleBetween(schedule, from, addDays(date > today ? date : today, 180));
  const current = (id: string) =>
    schedule.slots.find((s) => s.student_id === id && !s.id.startsWith("usual-") && (!s.ends_on || s.ends_on >= today));
  const pupils: Pupil[] = students.map((s) => ({
    id: s.id,
    name: s.name,
    minutes: s.lesson_minutes ?? current(s.id)?.minutes ?? 30,
  }));
  const nameOf = new Map(students.map((s) => [s.id, s.name]));
  const booked: Booked[] = occs
    .filter((o) => isOn(o) && o.time)
    .map((o) => ({ date: o.date, time: o.time!, minutes: o.minutes, name: nameOf.get(o.studentId) ?? "Student" }));

  return (
    <Shell title="Add lesson" back={{ href: next, label: "Back" }} tab="downbeat">
      <AddLessonForm
        pupils={pupils}
        booked={booked}
        date={date}
        next={next}
        student={sp.student ?? null}
        everyOtherWeek={schedule.foundation}
      />
    </Shell>
  );
}
