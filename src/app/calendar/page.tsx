import Link from "next/link";
import { Suspense } from "react";
import { Shell } from "@/components/shell";
import { cx } from "@/components/ui";
import { requireTeacher } from "@/lib/auth";
import { listStudents } from "@/lib/data";
import { addDays, formatDate, parseISODate, todayISO } from "@/lib/format";
import { monthOf } from "@/lib/practice/month";
import { type Closure, type Occurrence, cancelLabel, formatTime, isOn, occurrenceRef, toMinutes, weekStart } from "@/lib/schedule";
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

type Held = { id: string; status: string };
type Ctx = { today: string; nameOf: Map<string, string>; held: Map<string, Held>; closures: Closure[] };

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
  const ctx: Ctx = {
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
          picked={sp.day && ISO.test(sp.day) ? sp.day : showsToday ? today : null}
          dayHref={(d) => href("month", anchor, d)}
        />
      )}

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

// ---------- shared bits ----------

function closedOn(date: string, closures: Closure[]): Closure | undefined {
  return closures.find((c) => date >= c.starts_on && date <= c.ends_on);
}

function lessonHref(o: Occurrence): string {
  const ref = occurrenceRef(o);
  return ref && !o.fallback ? `/schedule/${ref}` : `/students/${o.studentId}`;
}

/** Colour by state: on (accent), held (sage), moved / one-off / make-up (plum), off (muted, struck). */
function tone(o: Occurrence, ctx: Ctx): string {
  if (!isOn(o)) return o.kind === "noshow" ? "bg-danger-soft text-danger" : "bg-rule/50 text-muted line-through";
  if (ctx.held.has(`${o.studentId}:${o.date}`)) return "bg-sage-soft text-sage";
  if (o.kind === "moved" || o.kind === "extra") return "bg-plum-soft text-plum";
  return "bg-accent-soft text-accent-ink";
}

function firstName(ctx: Ctx, id: string) {
  return (ctx.nameOf.get(id) ?? "Student").split(" ")[0];
}

function dayLabel(d: string) {
  return parseISODate(d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

// ---------- Week, phone: one line per lesson under each day ----------

function WeekList({ from, occs, ctx }: { from: string; occs: Occurrence[]; ctx: Ctx }) {
  return (
    <div className="flex flex-col divide-y divide-rule">
      {Array.from({ length: 7 }, (_, i) => addDays(from, i)).map((d) => (
        <DayAgenda key={d} date={d} occs={occs.filter((o) => o.date === d)} ctx={ctx} />
      ))}
    </div>
  );
}

function DayAgenda({ date, occs, ctx, heading = true }: { date: string; occs: Occurrence[]; ctx: Ctx; heading?: boolean }) {
  const closed = closedOn(date, ctx.closures);
  return (
    <div className={cx("py-2.5", date === ctx.today && "bg-accent-soft/40")}>
      {heading && (
        <div className={cx("text-[15px]", date === ctx.today ? "font-semibold text-accent-ink" : "text-muted")}>
          {dayLabel(date)}
          {date === ctx.today && " · today"}
          {closed && <span className="ml-2 text-muted">Studio closed{closed.note ? `: ${closed.note}` : ""}</span>}
        </div>
      )}
      {occs.length === 0 ? (
        !closed && <div className="text-[15px] text-muted/70">—</div>
      ) : (
        <ul className="flex flex-col">
          {occs.map((o) => (
            <AgendaLine key={o.key} o={o} ctx={ctx} />
          ))}
        </ul>
      )}
    </div>
  );
}

function AgendaLine({ o, ctx }: { o: Occurrence; ctx: Ctx }) {
  const off = !isOn(o);
  const held = ctx.held.get(`${o.studentId}:${o.date}`);
  return (
    <li>
      <Link href={lessonHref(o)} className="flex min-h-11 flex-wrap items-center gap-x-3 no-underline">
        <span className={cx("w-[4.6rem] shrink-0 tabular-nums font-semibold text-ink", off && "text-muted line-through")}>
          {o.time ? formatTime(o.time) : "—"}
        </span>
        <span className={cx("min-w-0 text-[17px] font-semibold text-ink", off && "text-muted line-through")}>
          {ctx.nameOf.get(o.studentId) ?? "Student"}
        </span>
        <span className="text-sm text-muted">{o.minutes} min</span>
        <StateWord o={o} held={held} ctx={ctx} />
      </Link>
    </li>
  );
}

function StateWord({ o, held, ctx }: { o: Occurrence; held?: Held; ctx: Ctx }) {
  const words: [string, string][] = [];
  if (!isOn(o)) words.push([cancelLabel(o), o.kind === "noshow" ? "text-danger" : "text-muted"]);
  if (o.kind === "moved" && o.from) words.push([`moved from ${formatDate(o.from, "weekday")}`, "text-plum"]);
  if (o.kind === "extra") words.push([o.makeupFor ? "make-up" : "one-off", "text-plum"]);
  if (o.makeupOwed) words.push(["make-up owed", "text-amber"]);
  if (held) words.push([held.status === "draft" ? "draft" : "✓ held", held.status === "draft" ? "text-amber" : "text-sage"]);
  if (isOn(o) && o.overlaps.length) words.push([`overlaps ${o.overlaps.map((id) => firstName(ctx, id)).join(", ")}`, "text-danger"]);
  return (
    <>
      {words.map(([w, c]) => (
        <span key={w} className={cx("text-sm font-medium", c)}>
          {w}
        </span>
      ))}
    </>
  );
}

// ---------- Week, iPad and computer: a time grid ----------

const HOUR_PX = 72;

function WeekGrid({ from, occs, ctx }: { from: string; occs: Occurrence[]; ctx: Ctx }) {
  const timed = occs.filter((o) => o.time);
  // Hours shown: the lessons' own span, at least 2 pm to 7 pm.
  const starts = timed.map((o) => toMinutes(o.time!));
  const ends = timed.map((o) => toMinutes(o.time!) + o.minutes);
  const first = Math.min(14, ...starts.map((m) => Math.floor(m / 60)));
  const last = Math.max(19, ...ends.map((m) => Math.ceil(m / 60)));
  const hours = Array.from({ length: last - first }, (_, i) => first + i);
  const days = Array.from({ length: 7 }, (_, i) => addDays(from, i));
  const untimed = occs.filter((o) => !o.time);

  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[44rem] grid-cols-[3.5rem_repeat(7,1fr)]">
        {/* Day headings */}
        <div />
        {days.map((d) => {
          const closed = closedOn(d, ctx.closures);
          return (
            <div key={d} className={cx("border-b border-rule px-1.5 pb-1.5 text-[14px]", d === ctx.today ? "font-semibold text-accent-ink" : "text-muted")}>
              {dayLabel(d)}
              {closed && <div className="text-xs text-muted">Closed{closed.note ? `: ${closed.note}` : ""}</div>}
            </div>
          );
        })}

        {/* Hour labels */}
        <div className="relative" style={{ height: hours.length * HOUR_PX }}>
          {hours.map((h, i) => (
            <div key={h} className="absolute right-2 -translate-y-2 text-xs tabular-nums text-muted" style={{ top: i * HOUR_PX }}>
              {formatTime(`${String(h).padStart(2, "0")}:00`).replace(":00", "")}
            </div>
          ))}
        </div>

        {/* One column per day */}
        {days.map((d) => (
          <div
            key={d}
            className={cx("relative border-l border-rule", d === ctx.today && "bg-accent-soft/30", closedOn(d, ctx.closures) && "bg-rule/30")}
            style={{ height: hours.length * HOUR_PX }}
          >
            {hours.map((h, i) => (
              <div key={h} className="absolute inset-x-0 border-t border-rule/60" style={{ top: i * HOUR_PX }} />
            ))}
            {timed
              .filter((o) => o.date === d)
              .map((o) => {
                const top = ((toMinutes(o.time!) - first * 60) / 60) * HOUR_PX;
                const height = Math.max(22, (o.minutes / 60) * HOUR_PX - 2);
                // Overlapping lessons share the column side by side.
                const group = timed.filter((x) => x.date === d && (x === o || o.overlaps.includes(x.studentId)));
                const idx = group.indexOf(o);
                const width = 100 / group.length;
                return (
                  <Link
                    key={o.key}
                    href={lessonHref(o)}
                    title={`${ctx.nameOf.get(o.studentId) ?? ""} ${formatTime(o.time)} · ${o.minutes} min`}
                    className={cx("absolute overflow-hidden rounded-md px-1.5 py-0.5 text-[13px] leading-tight no-underline", tone(o, ctx))}
                    style={{ top, height, left: `calc(${idx * width}% + 2px)`, width: `calc(${width}% - 4px)` }}
                  >
                    {height < 44 ? (
                      <span className="block truncate">
                        <b>{firstName(ctx, o.studentId)}</b> {formatTime(o.time).replace(" pm", "p").replace(" am", "a")}
                      </span>
                    ) : (
                      <>
                        <span className="block truncate font-semibold">{firstName(ctx, o.studentId)}</span>
                        <span className="block truncate">
                          {formatTime(o.time)} · {o.minutes} min
                        </span>
                      </>
                    )}
                  </Link>
                );
              })}
          </div>
        ))}
      </div>
      {untimed.length > 0 && (
        <div className="mt-3">
          <div className="text-sm text-muted">Time not set</div>
          <ul>
            {untimed.map((o) => (
              <AgendaLine key={o.key} o={o} ctx={ctx} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ---------- Month: a grid of days; the picked day's lessons below ----------

function MonthGrid({
  from,
  to,
  month,
  occs,
  ctx,
  picked,
  dayHref,
}: {
  from: string;
  to: string;
  month: string;
  occs: Occurrence[];
  ctx: Ctx;
  picked: string | null;
  dayHref: (d: string) => string;
}) {
  const days: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-7 border-l border-t border-rule">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((w) => (
          <div key={w} className="border-b border-r border-rule py-1 text-center text-xs font-medium uppercase tracking-wide text-muted">
            {w}
          </div>
        ))}
        {days.map((d) => {
          const list = occs.filter((o) => o.date === d);
          const on = list.filter(isOn);
          const inMonth = monthOf(d) === month;
          const closed = closedOn(d, ctx.closures);
          return (
            <Link
              key={d}
              href={dayHref(d)}
              aria-label={`${dayLabel(d)}: ${on.length} lesson${on.length === 1 ? "" : "s"}`}
              aria-current={picked === d ? "date" : undefined}
              className={cx(
                "flex min-h-[4.25rem] flex-col gap-0.5 border-b border-r border-rule p-1 text-left no-underline md:min-h-[6.5rem]",
                !inMonth && "opacity-45",
                closed && "bg-rule/30",
                picked === d && "outline outline-2 -outline-offset-2 outline-accent",
              )}
            >
              <span
                className={cx(
                  "flex size-6 items-center justify-center rounded-full text-[13px] tabular-nums",
                  d === ctx.today ? "bg-accent font-semibold text-white" : "text-ink",
                )}
              >
                {parseISODate(d).getDate()}
              </span>
              {/* Phone: a dot per lesson. Wider screens: time and name. */}
              <span className="flex flex-wrap gap-0.5 md:hidden">
                {list.slice(0, 6).map((o) => (
                  <span key={o.key} className={cx("size-2 rounded-full", isOn(o) ? (o.kind === "moved" || o.kind === "extra" ? "bg-plum" : "bg-accent") : "bg-rule")} />
                ))}
              </span>
              <span className="hidden flex-col gap-0.5 md:flex">
                {list.slice(0, 4).map((o) => (
                  <span key={o.key} className={cx("truncate rounded px-1 text-[12px] leading-snug", tone(o, ctx))}>
                    {o.time ? formatTime(o.time).replace(" pm", "p").replace(" am", "a") : ""} {firstName(ctx, o.studentId)}
                  </span>
                ))}
                {list.length > 4 && <span className="text-[12px] text-muted">+{list.length - 4} more</span>}
              </span>
            </Link>
          );
        })}
      </div>

      {picked && picked >= from && picked <= to && (
        <section>
          <h3 className={cx("text-[17px] font-semibold", picked === ctx.today && "text-accent-ink")}>
            {formatDate(picked, "long")}
          </h3>
          <DayAgenda date={picked} occs={occs.filter((o) => o.date === picked)} ctx={ctx} heading={false} />
          {closedOn(picked, ctx.closures) && (
            <p className="text-[15px] text-muted">Studio closed{closedOn(picked, ctx.closures)!.note ? `: ${closedOn(picked, ctx.closures)!.note}` : ""}.</p>
          )}
        </section>
      )}
    </div>
  );
}

function Legend({ foundation }: { foundation: boolean }) {
  const items: [string, string][] = [
    ["bg-accent-soft", "Lesson"],
    ["bg-sage-soft", "Held"],
    ["bg-plum-soft", "Moved, one-off or make-up"],
    ["bg-rule/50", "Cancelled"],
  ];
  if (foundation) items.push(["bg-rule/30", "Studio closed"]);
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
      {items.map(([c, l]) => (
        <span key={l} className="flex items-center gap-1.5">
          <span className={cx("size-3 rounded-sm border border-rule", c)} />
          {l}
        </span>
      ))}
    </div>
  );
}
