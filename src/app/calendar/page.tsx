import Link from "next/link";
import { Suspense } from "react";
import { Shell } from "@/components/shell";
import { cx } from "@/components/ui";
import { requireTeacher } from "@/lib/auth";
import { listStudents } from "@/lib/data";
import { addDays, formatDate, parseISODate, todayISO } from "@/lib/format";
import { monthOf } from "@/lib/practice/month";
import { weekStart } from "@/lib/schedule";
import { type CalendarCtx, Legend, addLessonHref, MonthGrid, WeekGrid, WeekList } from "@/components/calendar-views";
import { loadSchedule, scheduleBetween } from "@/lib/schedule-data";
import { createClient } from "@/lib/supabase/server";

type SP = Promise<{ view?: string; d?: string; day?: string }>;

// The full calendar: every lesson from the one schedule (Settings → Lesson
// times), a week or a month at a time. Week: a time grid on iPad and
// computer, a day-by-day list on the phone. Month: a grid of days; tap a day
// for its lessons underneath. Each lesson opens its own page.
export default function CalendarPage({ searchParams }: { searchParams: SP }) {
  return (
    <Shell title="Calendar" back={{ href: "/downbeat", label: "Intro" }} tab="downbeat" wide>
      <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-sheet" />}>
        <Body searchParams={searchParams} />
      </Suspense>
    </Shell>
  );
}


const ISO = /^\d{4}-\d{2}-\d{2}$/;

async function Body({ searchParams }: { searchParams: SP }) {
  await requireTeacher();
  const sp = await searchParams;
  const today = todayISO();
  const view = sp.view === "month" ? "month" : "week";
  const anchor = sp.d && ISO.test(sp.d) ? sp.d : today;

  // The span shown: a Monday-to-Sunday week, or the whole weeks covering a month.
  const monthStart = `${monthOf(anchor)}-01`;
  const monthEnd = addDays(`${monthOf(addDays(monthStart, 32))}-01`, -1);
  const from = view === "week" ? weekStart(anchor) : weekStart(monthStart);
  const to = view === "week" ? addDays(from, 6) : addDays(weekStart(monthEnd), 6);

  const students = (await listStudents()).filter((s) => s.active);
  const schedule = await loadSchedule(students, from);
  const occs = scheduleBetween(schedule, from, to);
  const supabase = await createClient();
  const { data: records } = await supabase
    .from("lessons")
    .select("id, student_id, lesson_date, status")
    .in("student_id", students.length ? students.map((s) => s.id) : ["00000000-0000-0000-0000-000000000000"])
    .gte("lesson_date", from)
    .lte("lesson_date", to);
  const ctx: CalendarCtx = {
    today,
    nameOf: new Map(students.map((s) => [s.id, s.name])),
    held: new Map((records ?? []).map((r) => [`${r.student_id}:${r.lesson_date}`, { id: r.id, status: r.status }])),
    closures: schedule.closures,
  };

  const prev = view === "week" ? addDays(from, -7) : addDays(monthStart, -1);
  const next = view === "week" ? addDays(from, 7) : addDays(monthEnd, 1);
  const title =
    view === "week"
      ? `${formatDate(from)} – ${formatDate(to)}`
      : parseISODate(monthStart).toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const showsToday = today >= (view === "week" ? from : monthStart) && today <= (view === "week" ? to : monthEnd);
  const href = (v: string, d: string, day?: string) => `/calendar?view=${v}&d=${d}${day ? `&day=${day}` : ""}`;

  return (
    <div className="flex flex-col gap-4">
      {/* View and dates */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex rounded-full border border-rule bg-sheet p-0.5 text-[15px]" role="group" aria-label="View">
          {(["week", "month"] as const).map((v) => (
            <Link
              key={v}
              href={href(v, anchor)}
              aria-current={view === v ? "true" : undefined}
              className={cx("flex min-h-10 items-center rounded-full px-4 font-semibold no-underline", view === v ? "bg-accent-soft text-accent-ink" : "text-muted")}
            >
              {v === "week" ? "Week" : "Month"}
            </Link>
          ))}
        </div>
        <div className="flex items-center gap-1 text-[15px]">
          <NavLink href={href(view, prev)} label={view === "week" ? "Earlier week" : "Earlier month"}>‹</NavLink>
          {!showsToday && (
            <Link href={href(view, today)} className="flex min-h-10 items-center rounded-full px-3 font-medium text-accent-ink no-underline hover:bg-accent-soft">
              Today
            </Link>
          )}
          <NavLink href={href(view, next)} label={view === "week" ? "Later week" : "Later month"}>›</NavLink>
        </div>
      </div>
      <h2 className="font-display text-[22px] font-semibold">{title}</h2>

      {!schedule.ready && (
        <p className="text-[15px] text-muted">
          Showing each student&apos;s Lesson day and time. Run lesson-schedule.sql to set lesson times properly.
        </p>
      )}

      {view === "week" ? (
        <>
          <div className="md:hidden">
            <WeekList from={from} occs={occs} ctx={ctx} />
          </div>
          <div className="hidden md:block">
            <WeekGrid from={from} occs={occs} ctx={ctx} />
          </div>
        </>
      ) : (
        <MonthGrid
          from={from}
          to={to}
          month={monthOf(monthStart)}
          occs={occs}
          ctx={ctx}
          back={href("month", anchor)}
        />
      )}

      <Link
        href={addLessonHref(showsToday ? today : view === "week" ? from : monthStart, href(view, anchor))}
        className="self-start rounded-full border border-rule bg-sheet px-4 py-2 text-[16px] font-semibold text-accent-ink no-underline hover:bg-accent-soft"
      >
        + Add lesson
      </Link>
      <Legend foundation={schedule.foundation} />
      <p className="text-sm text-muted">
        Set regular lessons, one-offs and closed dates in{" "}
        <Link href="/settings/lesson-times" className="font-medium text-accent-ink">
          Settings → Lesson times
        </Link>
        .
      </p>
    </div>
  );
}

function NavLink({ href, label, children }: { href: string; label: string; children: React.ReactNode }) {
  return (
    <Link href={href} aria-label={label} className="flex size-10 items-center justify-center rounded-full text-xl text-ink no-underline hover:bg-accent-soft">
      {children}
    </Link>
  );
}
