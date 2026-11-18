import { Suspense } from "react";
import { Shell } from "@/components/shell";
import { LessonTimes } from "@/components/lesson-times";
import { requireTeacher } from "@/lib/auth";
import { listStudents } from "@/lib/data";
import { todayISO } from "@/lib/format";
import { loadSchedule } from "@/lib/schedule-data";

// Settings → Lesson times: each student's regular weekly lesson and one-off
// lessons. Intro's week calendar reads from these.
export default function LessonTimesPage() {
  return (
    <Shell title="Lesson times" back={{ href: "/settings", label: "Settings" }} tab="settings" v3Tab="setup">
      <Suspense fallback={<div className="h-40 animate-pulse rounded-2xl bg-sheet" />}>
        <Body />
      </Suspense>
    </Shell>
  );
}

async function Body() {
  await requireTeacher();
  const today = todayISO();
  const active = (await listStudents()).filter((s) => s.active);
  const schedule = await loadSchedule(active, today);
  return <LessonTimes students={active} slots={schedule.slots} ready={schedule.ready} today={today} />;
}
