import Link from "next/link";
import { Suspense } from "react";
import { Shell } from "@/components/shell";
import { Avatar } from "@/components/avatar";
import { InstrumentTag } from "@/components/instrument-tag";
import { PreLessonBrief } from "@/components/pre-lesson-brief";
import { ConsentNeeded } from "@/components/consent-needed";
import { Fold } from "@/components/fold";
import { Button, Card, EmptyState, LinkButton, Pill, SectionTitle, cx } from "@/components/ui";
import { startLesson } from "@/app/lessons/live-actions";
import { requireTeacher } from "@/lib/auth";
import { studentPhotoSrc } from "@/lib/constants";
import { listDraftLessons, listStudents, practiceTone } from "@/lib/data";
import { addDays, formatDate, parseISODate, relativeDay, todayISO } from "@/lib/format";
import { consentPath } from "@/lib/recording-consent";
import {
  type Occurrence,
  cancelLabel,
  endTime,
  formatTime,
  isOn,
  nowMinutes,
  occurrenceRef,
  toMinutes,
  untilLabel,
  weekStart,
} from "@/lib/schedule";
import { loadSchedule, scheduleBetween } from "@/lib/schedule-data";
import { CraftLine } from "@/components/craft-line";
import { CraftSection } from "@/components/craft-section";
import { type TodayRow, loadTodayRow } from "@/lib/v3-data";
import { WeekSwitcher } from "@/components/week-switcher";
import { IntroCalendar } from "@/components/intro-calendar";
import { MonthGrid, addLessonHref, pressOf } from "@/components/calendar-views";
import { LessonPress } from "@/components/lesson-press";
import { PressToAdd } from "@/components/press-to-add";
import { monthOf } from "@/lib/practice/month";
import { createClient } from "@/lib/supabase/server";

// How far Earlier / Later reach. Every week in range is sent with the page,
// so switching weeks happens on the phone with no wait.
const WEEKS_BACK = 8;
const WEEKS_AHEAD = 8;

type SP = Promise<{ w?: string; cal?: string; m?: string }>;

// Months the Month view can show without a trip to the server.
const MONTHS_BACK = 1;
const MONTHS_AHEAD = 3;

// Intro (route /downbeat, once called Downbeat): the teacher's landing page. The schedule first (next lesson with
// Start lesson, today's agenda, the week), then what needs a look (drafts,
// consent, who has and hasn't practised), then every student one tap away.
// Everything opens in place; the only pages it leads to are ones that
// already exist.
export default function DownbeatPage({ searchParams }: { searchParams: SP }) {
  return (
    <Shell
      title="Intro"
      eyebrow={
        <Suspense fallback="Your teaching day">
          <DateLine />
        </Suspense>
      }
      tab="downbeat"
      wide
    >
      <div className="flex flex-col gap-7">
        <Suspense fallback={null}>
          <Focus />
        </Suspense>
        <Suspense fallback={<Skeleton />}>
          <Body searchParams={searchParams} />
        </Suspense>
        <Suspense fallback={null}>
          <Craft />
        </Suspense>
      </div>
    </Shell>
  );
}

async function DateLine() {
  await requireTeacher();
  return formatDate(todayISO(), "long");
}

async function Focus() {
  const { teacher } = await requireTeacher();
  return <CraftLine teacherId={teacher.id} />;
}

async function Craft() {
  const { teacher } = await requireTeacher();
  return <CraftSection teacherId={teacher.id} />;
}

async function Body({ searchParams }: { searchParams: SP }) {
  await requireTeacher();
  const today = todayISO();
  const [{ w, cal, m }, students, drafts] = await Promise.all([searchParams, listStudents(), listDraftLessons()]);
  const active = students.filter((s) => s.active);
  if (active.length === 0) {
    return (
      <EmptyState title="No students yet" action={<LinkButton href="/students/new">Add your first student</LinkButton>}>
        Add a student and give them a lesson time. Intro then shows your week, the next lesson and who practised.
      </EmptyState>
    );
  }

  const offset = Math.max(-WEEKS_BACK, Math.min(WEEKS_AHEAD, Math.round(Number(w) || 0)));
  const thisMonday = weekStart(today);
  const firstMonday = addDays(thisMonday, -WEEKS_BACK * 7);
  const schedule = await loadSchedule(active, firstMonday);
  const ahead = scheduleBetween(schedule, today, addDays(today, 60));
  const rows = await Promise.all(
    active.map((s) => loadTodayRow(s, today, ahead.filter((o) => o.studentId === s.id))),
  );
  const rowOf = new Map(rows.map((r) => [r.student.id, r]));

  const allWeeks = scheduleBetween(schedule, firstMonday, addDays(thisMonday, WEEKS_AHEAD * 7 + 6));
  const nameOf = new Map(active.map((s) => [s.id, s.name]));

  // Month view: whole weeks covering each month in range.
  const monthStartAt = (o: number) => {
    let d = `${monthOf(today)}-01`;
    for (let i = 0; i < Math.abs(o); i++) d = o > 0 ? `${monthOf(addDays(d, 32))}-01` : `${monthOf(addDays(d, -1))}-01`;
    return d;
  };
  const monthSpans = Array.from({ length: MONTHS_BACK + MONTHS_AHEAD + 1 }, (_, i) => {
    const o = i - MONTHS_BACK;
    const start = monthStartAt(o);
    const end = addDays(`${monthOf(addDays(start, 32))}-01`, -1);
    return { o, start, from: weekStart(start), to: addDays(weekStart(end), 6) };
  });
  const spanFrom = monthSpans[0].from;
  const spanTo = monthSpans[monthSpans.length - 1].to;
  const monthOccs = scheduleBetween(schedule, spanFrom, spanTo);
  const { data: heldRows } = await (await createClient())
    .from("lessons")
    .select("id, student_id, lesson_date, status")
    .in("student_id", active.map((s) => s.id))
    .gte("lesson_date", spanFrom)
    .lte("lesson_date", spanTo);
  const calCtx = {
    today,
    nameOf,
    held: new Map((heldRows ?? []).map((r) => [`${r.student_id}:${r.lesson_date}`, { id: r.id, status: r.status }])),
    closures: schedule.closures,
  };
  const monthOffset = Math.max(-MONTHS_BACK, Math.min(MONTHS_AHEAD, Math.round(Number(m) || 0)));
  const todays = ahead.filter((o) => o.date === today);
  const now = nowMinutes();

  // Up next: a lesson running now, else the first one today that hasn't
  // ended and has no lesson record yet, else the first one on a later day.
  const running = rows.find((r) => r.runningLessonId);
  const upNext: { row: TodayRow; occ: Occurrence | null } | null = running
    ? { row: running, occ: todays.find((o) => o.studentId === running.student.id && isOn(o)) ?? null }
    : (() => {
        const occ = ahead.find(
          (o) =>
            isOn(o) &&
            rowOf.has(o.studentId) &&
            (o.date > today ||
              (!rowOf.get(o.studentId)!.hadLessonToday &&
                (o.time === null || toMinutes(endTime(o.time, o.minutes)!) > now))),
        );
        return occ ? { row: rowOf.get(occ.studentId)!, occ } : null;
      })();

  const needConsent = rows.filter((r) => r.consent !== "signed");
  const practised = rows.filter((r) => r.week.daysPracticed > 0).sort((a, b) => b.week.daysPracticed - a.week.daysPracticed);
  const notYet = rows.filter((r) => r.week.daysPracticed === 0);

  return (
    <div className="flex flex-col gap-7">
      {!schedule.ready && (
        <Card tone="amber" className="text-[16px]">
          Lesson times can&apos;t be saved yet: run <b>lesson-schedule.sql</b> in the Supabase SQL Editor once. Until
          then Intro uses each student&apos;s Lesson day and Lesson time, and cancelling or moving a lesson is off.
        </Card>
      )}

      {/* Up next */}
      {upNext && <UpNext row={upNext.row} occ={upNext.occ} today={today} now={now} />}

      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        {/* Today */}
        <section className="min-w-0">
          <SectionTitle action={<span className="text-sm text-muted">{todays.filter(isOn).length} lessons</span>}>
            Today
          </SectionTitle>
          {todays.length === 0 ? (
            <p className="rounded-2xl border border-rule bg-sheet px-4 py-3 text-[16px] text-muted">
              No lessons today.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-rule">
              {todays.map((o) => (
                <OccurrenceRow key={o.key} occ={o} row={rowOf.get(o.studentId)} today={today} nameOf={nameOf} big />
              ))}
            </ul>
          )}
        </section>

        {/* Needs you */}
        <section className="min-w-0">
          <SectionTitle>Needs you</SectionTitle>
          {drafts.length === 0 && needConsent.length === 0 ? (
            <p className="rounded-2xl border border-rule bg-sheet px-4 py-3 text-[16px] text-muted">
              Nothing waiting. All lessons approved and every consent signed.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {drafts.map((d) => (
                <li key={d.id}>
                  <Link href={`/lessons/${d.id}`} className="block no-underline">
                    <Card tone="amber" className="flex items-center gap-3 py-3">
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-ink">
                          {d.students?.name ?? "Student"}{" "}
                          <span className="font-normal text-muted">· {formatDate(d.lesson_date, "weekday")}</span>
                        </div>
                        <div className="truncate text-sm text-muted">{d.summary || "Draft lesson record"}</div>
                      </div>
                      <span className="text-sm font-semibold text-accent-ink">Approve ›</span>
                    </Card>
                  </Link>
                </li>
              ))}
              {needConsent.map((r) => (
                <li key={r.student.id}>
                  <Link href={consentPath(r.student.id, "/downbeat")} className="block no-underline">
                    <Card className="flex items-center gap-3 border-danger/30 py-3">
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-ink">{r.student.name}</div>
                        <div className="text-sm text-muted">
                          {r.consent === "setup" ? "Consent records aren't set up yet" : "Parent consent needed before recording"}
                        </div>
                      </div>
                      <Pill tone="danger">Consent needed</Pill>
                    </Card>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* The calendar: Week / Month and the full calendar link on top. Every
          week and month in range is rendered here; the switchers show one. */}
      <IntroCalendar
        initialView={cal === "month" ? "month" : "week"}
        initialMonth={monthOffset}
        addHref={addLessonHref(today, "/downbeat")}
        week={
            <WeekSwitcher
              initial={offset}
              weeks={Array.from({ length: WEEKS_BACK + WEEKS_AHEAD + 1 }, (_, i) => {
                const o = i - WEEKS_BACK;
                const monday = addDays(thisMonday, o * 7);
                const sunday = addDays(monday, 6);
                return {
                  offset: o,
                  title: o === 0 ? "This week" : `Week of ${formatDate(monday)}`,
                  body: (
                    <WeekDays
                      monday={monday}
                      week={allWeeks.filter((x) => x.date >= monday && x.date <= sunday)}
                      rowOf={rowOf}
                      today={today}
                      nameOf={nameOf}
                    />
                  ),
                };
              })}
            />
        }
        months={monthSpans.map((x) => ({
          offset: x.o,
          title: parseISODate(x.start).toLocaleDateString("en-US", { month: "long", year: "numeric" }),
          body: (
            <MonthGrid
              from={x.from}
              to={x.to}
              month={monthOf(x.start)}
              occs={monthOccs.filter((o) => o.date >= x.from && o.date <= x.to)}
              ctx={calCtx}
              back="/downbeat?cal=month"
            />
          ),
        }))}
      />

      {/* Practice since the last lesson */}
      <section>
        <SectionTitle>Practice since each lesson</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-2">
          <Card tone="sage" className="flex flex-col gap-2">
            <div className="font-semibold">Practised</div>
            {practised.length === 0 ? (
              <p className="text-[15px] text-muted">Nobody yet.</p>
            ) : (
              practised.map((r) => <PracticeLine key={r.student.id} row={r} />)
            )}
          </Card>
          <Card tone="amber" className="flex flex-col gap-2">
            <div className="font-semibold">Not yet</div>
            {notYet.length === 0 ? (
              <p className="text-[15px] text-muted">Everyone has practised.</p>
            ) : (
              notYet.map((r) => <PracticeLine key={r.student.id} row={r} />)
            )}
          </Card>
        </div>
      </section>

    </div>
  );
}

// ---------- Up next ----------

function UpNext({ row, occ, today, now }: { row: TodayRow; occ: Occurrence | null; today: string; now: number }) {
  const s = row.student;
  const when = occ
    ? occ.date === today
      ? `Today ${formatTime(occ.time)}${occ.time ? ` · ${untilLabel(toMinutes(occ.time) - now)}` : ""}`
      : `${relativeDay(occ.date, today) === formatDate(occ.date) ? formatDate(occ.date, "weekday") : relativeDay(occ.date, today)}, ${formatTime(occ.time)}`
    : "Now";
  return (
    <section aria-label="Up next">
      <Card className="flex flex-col gap-4 border-accent/40">
        <div className="flex items-start gap-3">
          <Avatar name={s.name} instrument={s.instrument} photoSrc={studentPhotoSrc(s)} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-semibold uppercase tracking-[0.12em] text-accent-ink">
              {row.runningLessonId ? "In lesson now" : "Up next"} · {when}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link href={`/students/${s.id}`} className="font-display text-[28px] font-semibold leading-tight text-ink no-underline">
                {s.name}
              </Link>
              <InstrumentTag instrument={s.instrument} />
            </div>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {s.current_book && <Pill>{s.current_book}</Pill>}
              {occ && <Pill>{occ.minutes} min</Pill>}
              {row.consent === "signed" ? <Pill tone="sage">✓ Consent signed</Pill> : <Pill tone="danger">Consent needed</Pill>}
              <Pill tone={practiceTone(row.week)}>
                practised {row.week.daysPracticed} of {row.week.days.length} days
              </Pill>
            </div>
          </div>
        </div>

        {row.runningLessonId ? (
          <div className="grid gap-2 sm:grid-cols-2">
            <LinkButton href={`/lessons/${row.runningLessonId}/live`} className="min-h-14 text-lg">
              Back to the lesson
            </LinkButton>
            <LinkButton href={`/lessons/${row.runningLessonId}`} variant="secondary" className="min-h-14 text-lg">
              Open the lesson record
            </LinkButton>
          </div>
        ) : row.consent === "signed" ? (
          <form action={startLesson}>
            <input type="hidden" name="student_id" value={s.id} />
            <Button className="min-h-16 w-full text-xl">Start lesson</Button>
          </form>
        ) : (
          <ConsentNeeded studentId={s.id} studentName={s.name} state={row.consent} next="/downbeat" what="starting the lesson" />
        )}

        <Fold title="Pre-lesson brief" meta={`${s.name.split(" ")[0]}'s last lesson and practice`}>
          <PreLessonBrief student={s} lessons={row.lessons} week={row.week} repertoire={row.repertoire} showRecordButton={false} />
        </Fold>
      </Card>
    </section>
  );
}

// ---------- One lesson in a list ----------

function OccurrenceRow({
  occ,
  row,
  today,
  nameOf,
  big,
}: {
  occ: Occurrence;
  row: TodayRow | undefined;
  today: string;
  nameOf: Map<string, string>;
  big?: boolean;
}) {
  if (!row) return null;
  const s = row.student;
  const off = !isOn(occ);
  const record = row.lessons.find((l) => l.lesson_date === occ.date);
  const running = occ.date === today && row.runningLessonId;
  const past = occ.date < today;
  const ref = occurrenceRef(occ);
  return (
    <li className={cx(big && "py-2.5")}>
      <LessonPress lesson={pressOf(occ, s.name)} className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className={cx("w-[4.6rem] shrink-0 tabular-nums font-semibold", off && "text-muted line-through")}>
          {occ.time ? formatTime(occ.time) : "—"}
        </span>
        <Link
          href={`/students/${s.id}`}
          className={cx("min-w-0 font-semibold text-ink no-underline", big ? "text-[18px]" : "text-[16px]", off && "text-muted line-through")}
        >
          {s.name}
        </Link>
        <span className="text-sm text-muted">{occ.minutes} min</span>
        {off && <Pill tone={occ.kind === "noshow" ? "danger" : "muted"}>{cancelLabel(occ)}</Pill>}
        {occ.makeupOwed && <Pill tone="amber">make-up owed</Pill>}
        {occ.kind === "moved" && occ.from && <Pill tone="plum">moved from {formatDate(occ.from, "weekday")}</Pill>}
        {occ.kind === "extra" && <Pill tone="plum">{occ.makeupFor ? "make-up" : "one-off"}</Pill>}
        {!off && occ.overlaps.length > 0 && (
          <Pill tone="danger">overlaps {occ.overlaps.map((id) => nameOf.get(id)?.split(" ")[0] ?? "another").join(", ")}</Pill>
        )}
        {!off && row.consent !== "signed" && <Pill tone="danger">consent needed</Pill>}
        {running ? (
          <Link href={`/lessons/${row.runningLessonId}/live`} className="no-underline">
            <Pill tone="accent">in lesson ›</Pill>
          </Link>
        ) : record ? (
          <Link href={`/lessons/${record.id}`} className="no-underline">
            <Pill tone={record.status === "draft" ? "amber" : "sage"}>{record.status === "draft" ? "draft ›" : "✓ done ›"}</Pill>
          </Link>
        ) : (
          past && !off && <Pill>no record</Pill>
        )}
        <span className="ml-auto flex items-center gap-3">
          {big && !off && !record && !running && row.consent === "signed" && occ.date === today && (
            <form action={startLesson}>
              <input type="hidden" name="student_id" value={s.id} />
              <Button className="min-h-10 px-3 text-[15px]">Start</Button>
            </form>
          )}
          {ref && !occ.fallback && (
            <Link href={`/schedule/${ref}`} className="inline-flex min-h-10 items-center text-sm font-medium text-accent-ink">
              {past || record ? "Details ›" : "Change ›"}
            </Link>
          )}
        </span>
      </LessonPress>
    </li>
  );
}

// ---------- Practice ----------

function PracticeLine({ row }: { row: TodayRow }) {
  const s = row.student;
  const w = row.week;
  return (
    <Link href={`/family/${s.id}`} className="flex min-h-11 items-center gap-2 no-underline">
      <span className="min-w-0 flex-1 truncate text-[16px] font-medium text-ink">{s.name}</span>
      <span className="text-sm text-muted">
        {w.since ? `since ${formatDate(w.since)}` : "last 7 days"}
      </span>
      <Pill tone={practiceTone(w)}>
        {w.daysPracticed}/{w.days.length} days{w.totalMinutes ? ` · ${w.totalMinutes} min` : ""}
      </Pill>
    </Link>
  );
}

function WeekDays({
  monday,
  week,
  rowOf,
  today,
  nameOf,
}: {
  monday: string;
  week: Occurrence[];
  rowOf: Map<string, TodayRow>;
  today: string;
  nameOf: Map<string, string>;
}) {
  return (
    <div className="flex flex-col divide-y divide-rule rounded-2xl border border-rule bg-sheet">
      {Array.from({ length: 7 }, (_, i) => addDays(monday, i)).map((d) => {
        const list = week.filter((o) => o.date === d);
        return (
          <PressToAdd
            key={d}
            date={d}
            id={d === today ? "today" : undefined}
            className={cx("grid gap-2 px-3 py-2.5 sm:grid-cols-[120px_1fr]", d === today && "bg-accent-soft/50")}
          >
            <div className={cx("pt-1 text-[15px]", d === today ? "font-semibold text-accent-ink" : "text-muted")}>
              {parseISODate(d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
              {d === today && " · today"}
            </div>
            {list.length === 0 ? (
              <div className="pt-1 text-[15px] text-muted/70">—</div>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {list.map((o) => (
                  <OccurrenceRow key={o.key} occ={o} row={rowOf.get(o.studentId)} today={today} nameOf={nameOf} />
                ))}
              </ul>
            )}
          </PressToAdd>
        );
      })}
    </div>
  );
}

function Skeleton() {
  return (
    <div className="flex flex-col gap-3">
      <div className="h-56 animate-pulse rounded-2xl bg-sheet" />
      <div className="h-40 animate-pulse rounded-2xl bg-sheet" />
      <div className="h-64 animate-pulse rounded-2xl bg-sheet" />
    </div>
  );
}
