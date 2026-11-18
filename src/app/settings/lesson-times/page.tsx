import { Suspense } from "react";
import { Shell } from "@/components/shell";
import { CalendarLink } from "@/components/calendar-link";
import { LessonTimes } from "@/components/lesson-times";
import { requireTeacher } from "@/lib/auth";
import { feedLinks, getMyFeed, siteOrigin } from "@/lib/calendar-feeds";
import { listStudents } from "@/lib/data";
import { todayISO } from "@/lib/format";
import { loadSchedule, loadScheduleSettings } from "@/lib/schedule-data";

// Settings → Lesson times: each student's regular lesson, one-off and make-up
// lessons, studio closed dates, time zone, and your calendar link. Every
// screen that shows a lesson time reads from these.
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
  const { teacher } = await requireTeacher();
  const today = todayISO();
  const active = (await listStudents()).filter((s) => s.active);
  const [schedule, settings, feed, origin] = await Promise.all([
    loadSchedule(active, today),
    loadScheduleSettings(teacher.id),
    getMyFeed("teacher"),
    siteOrigin(),
  ]);
  return (
    <div className="flex flex-col gap-8">
      <LessonTimes
        students={active}
        slots={schedule.slots}
        changes={schedule.changes}
        closures={schedule.closures}
        ready={schedule.ready}
        foundation={schedule.foundation}
        today={today}
        settings={settings}
      />
      <section id="calendar" className="flex flex-col gap-2">
        <h2 className="mb-1 font-display text-[21px] font-semibold">Your calendar</h2>
        <CalendarLink
          kind="teacher"
          links={feed.token ? feedLinks(origin, feed.token) : null}
          ready={feed.ready}
          back="/settings/lesson-times"
        />
      </section>
    </div>
  );
}
