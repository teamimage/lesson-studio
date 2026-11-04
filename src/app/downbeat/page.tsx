import Link from "next/link";
import { Suspense } from "react";
import { Shell } from "@/components/shell";
import { Avatar } from "@/components/avatar";
import { InstrumentTag } from "@/components/instrument-tag";
import { PreLessonBrief } from "@/components/pre-lesson-brief";
import { ConsentNeeded } from "@/components/consent-needed";
import { Fold } from "@/components/fold";
import { Button, Card, EmptyState, Input, LinkButton, Pill, SectionTitle, Select, cx } from "@/components/ui";
import { startLesson } from "@/app/lessons/live-actions";
import { addExtraLesson, addSlot, changeLesson, removeSlot, undoChange } from "./actions";
import { requireTeacher } from "@/lib/auth";
import { studentPhotoSrc } from "@/lib/constants";
import { type Student, listDraftLessons, listStudents, practiceTone } from "@/lib/data";
import { addDays, formatDate, parseISODate, relativeDay, todayISO } from "@/lib/format";
import { consentPath } from "@/lib/recording-consent";
import {
  type Occurrence,
  type Slot,
  fallbackSlot,
  WEEKDAY_NAMES,
  endTime,
  formatTime,
  nowMinutes,
  occurrencesBetween,
  slotLabel,
  toMinutes,
  untilLabel,
  weekStart,
} from "@/lib/schedule";
import { loadSchedule } from "@/lib/schedule-data";
import { type TodayRow, loadTodayRow } from "@/lib/v3-data";

type SP = Promise<{ w?: string }>;

// Downbeat: the teacher's landing page. The schedule first (next lesson with
// Start lesson, today's agenda, the week), then what needs a look (drafts,
// consent, who has and hasn't practised), then every student one tap away.
// Everything opens in place; the only pages it leads to are ones that
// already exist.
export default function DownbeatPage({ searchParams }: { searchParams: SP }) {
  return (
    <Shell
      title="Downbeat"
      eyebrow={
        <Suspense fallback="Your teaching day">
          <DateLine />
        </Suspense>
      }
      tab="downbeat"
      wide
    >
      <Suspense fallback={<Skeleton />}>
        <Body searchParams={searchParams} />
      </Suspense>
    </Shell>
  );
}

async function DateLine() {
  await requireTeacher();
  return formatDate(todayISO(), "long");
}

async function Body({ searchParams }: { searchParams: SP }) {
  await requireTeacher();
  const today = todayISO();
  const [{ w }, students, drafts] = await Promise.all([searchParams, listStudents(), listDraftLessons()]);
  const active = students.filter((s) => s.active);
  if (active.length === 0) {
    return (
      <EmptyState title="No students yet" action={<LinkButton href="/students/new">Add your first student</LinkButton>}>
        Add a student and give them a lesson time. Downbeat then shows your week, the next lesson and who practised.
      </EmptyState>
    );
  }

  const offset = Math.max(-8, Math.min(8, Math.round(Number(w) || 0)));
  const monday = addDays(weekStart(today), offset * 7);
  const sunday = addDays(monday, 6);
  const [schedule, rows] = await Promise.all([
    loadSchedule(active, monday < today ? monday : today),
    Promise.all(active.map((s) => loadTodayRow(s, today))),
  ]);
  const rowOf = new Map(rows.map((r) => [r.student.id, r]));

  const week = occurrencesBetween(schedule.slots, schedule.changes, monday, sunday);
  const ahead = occurrencesBetween(schedule.slots, schedule.changes, today, addDays(today, 21));
  const todays = ahead.filter((o) => o.date === today);
  const now = nowMinutes();

  // Up next: a lesson running now, else the first one today that hasn't
  // ended and has no lesson record yet, else the first one on a later day.
  const running = rows.find((r) => r.runningLessonId);
  const upNext: { row: TodayRow; occ: Occurrence | null } | null = running
    ? { row: running, occ: todays.find((o) => o.studentId === running.student.id && o.kind !== "cancelled") ?? null }
    : (() => {
        const occ = ahead.find(
          (o) =>
            o.kind !== "cancelled" &&
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
  const slotsByStudent = new Map<string, typeof schedule.slots>();
  for (const s of schedule.slots) slotsByStudent.set(s.student_id, [...(slotsByStudent.get(s.student_id) ?? []), s]);

  return (
    <div className="flex flex-col gap-7">
      {!schedule.ready && (
        <Card tone="amber" className="text-[16px]">
          Lesson times can&apos;t be saved yet: run <b>lesson-schedule.sql</b> in the Supabase SQL Editor once. Until
          then Downbeat uses each student&apos;s Lesson day and Lesson time, and cancelling or moving a lesson is off.
        </Card>
      )}

      {/* Up next */}
      {upNext ? (
        <UpNext row={upNext.row} occ={upNext.occ} today={today} now={now} />
      ) : (
        <Card className="text-[16px]">
          No lessons in the next three weeks. Add lesson times under <b>Lesson times</b> below.
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        {/* Today */}
        <section className="min-w-0">
          <SectionTitle action={<span className="text-sm text-muted">{todays.filter((o) => o.kind !== "cancelled").length} lessons</span>}>
            Today
          </SectionTitle>
          {todays.length === 0 ? (
            <p className="rounded-2xl border border-rule bg-sheet px-4 py-3 text-[16px] text-muted">
              No lessons today.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {todays.map((o) => (
                <OccurrenceRow key={o.key} occ={o} row={rowOf.get(o.studentId)} today={today} canChange={schedule.ready} big />
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

      {/* The week */}
      <section>
        <SectionTitle
          action={
            <span className="flex items-center gap-1 text-sm">
              <WeekLink offset={offset - 1}>‹ Earlier</WeekLink>
              {offset !== 0 && <WeekLink offset={0}>This week</WeekLink>}
              <WeekLink offset={offset + 1}>Later ›</WeekLink>
            </span>
          }
        >
          {offset === 0 ? "This week" : `Week of ${formatDate(monday)}`}
        </SectionTitle>
        <div className="flex flex-col divide-y divide-rule rounded-2xl border border-rule bg-sheet">
          {Array.from({ length: 7 }, (_, i) => addDays(monday, i)).map((d) => {
            const list = week.filter((o) => o.date === d);
            return (
              <div
                key={d}
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
                      <OccurrenceRow key={o.key} occ={o} row={rowOf.get(o.studentId)} today={today} canChange={schedule.ready} />
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </section>

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

      {/* Students */}
      <section>
        <SectionTitle action={<Link href="/students/new" className="text-sm font-medium text-accent-ink underline">+ Student</Link>}>
          Students
        </SectionTitle>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((r) => {
            const s = r.student;
            const slots = slotsByStudent.get(s.id) ?? [];
            return (
              <Link
                key={s.id}
                href={`/students/${s.id}`}
                className="flex min-h-16 items-center gap-3 rounded-2xl border border-rule bg-sheet px-3 py-2 no-underline transition hover:border-accent/50"
              >
                <Avatar name={s.name} instrument={s.instrument} photoSrc={studentPhotoSrc(s)} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[17px] font-semibold text-ink">{s.name}</span>
                  <span className="block truncate text-sm text-muted">
                    {slots.length ? slots.map(slotLabel).join(", ") : "No lesson time"}
                  </span>
                </span>
                {r.consent !== "signed" && <Pill tone="danger">consent</Pill>}
                <span className="text-xl text-accent-ink" aria-hidden>
                  ›
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Lesson times */}
      <Fold title="Lesson times" meta="Set each student's regular lesson, or add a one-off">
        {!schedule.ready ? (
          <p className="text-[16px] text-muted">
            Run lesson-schedule.sql first. It also copies each student&apos;s current Lesson day and time in as their
            regular lesson.
          </p>
        ) : (
          <>
            <ul className="flex flex-col gap-3">
              {active.map((s) => (
                <li key={s.id} className="rounded-2xl border border-rule bg-paper px-3 py-3">
                  <div className="mb-2 font-semibold">{s.name}</div>
                  <SlotList studentId={s.id} slots={slotsByStudent.get(s.id) ?? []} />
                  <AddSlotForm student={s} />
                </li>
              ))}
            </ul>
            <div className="rounded-2xl border border-rule bg-paper px-3 py-3">
              <div className="mb-2 font-semibold">One-off lesson</div>
              <form action={addExtraLesson} className="grid gap-2 sm:grid-cols-[2fr_1.3fr_1fr_1fr_auto]">
                <Select name="student_id" aria-label="Student" required>
                  {active.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
                <Input type="date" name="on_date" aria-label="Date" defaultValue={today} required />
                <Input type="time" name="start_time" aria-label="Start time" required />
                <MinutesSelect />
                <Button variant="secondary">Add</Button>
              </form>
            </div>
          </>
        )}
      </Fold>
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
  canChange,
  big,
}: {
  occ: Occurrence;
  row: TodayRow | undefined;
  today: string;
  canChange: boolean;
  big?: boolean;
}) {
  if (!row) return null;
  const s = row.student;
  const cancelled = occ.kind === "cancelled";
  const record = row.lessons.find((l) => l.lesson_date === occ.date);
  const running = occ.date === today && row.runningLessonId;
  const past = occ.date < today;
  return (
    <li className={cx("rounded-xl", big && "border border-rule bg-sheet px-3 py-2.5")}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className={cx("w-[4.6rem] shrink-0 tabular-nums font-semibold", cancelled && "text-muted line-through")}>
          {occ.time ? formatTime(occ.time) : "—"}
        </span>
        <Link
          href={`/students/${s.id}`}
          className={cx("min-w-0 font-semibold text-ink no-underline", big ? "text-[18px]" : "text-[16px]", cancelled && "text-muted line-through")}
        >
          {s.name}
        </Link>
        <span className="text-sm text-muted">{occ.minutes} min</span>
        {cancelled && <Pill>cancelled</Pill>}
        {occ.kind === "moved" && occ.from && <Pill tone="plum">moved from {formatDate(occ.from, "weekday")}</Pill>}
        {occ.kind === "extra" && <Pill tone="plum">one-off</Pill>}
        {!cancelled && row.consent !== "signed" && <Pill tone="danger">consent needed</Pill>}
        {running ? (
          <Link href={`/lessons/${row.runningLessonId}/live`} className="no-underline">
            <Pill tone="accent">in lesson ›</Pill>
          </Link>
        ) : record ? (
          <Link href={`/lessons/${record.id}`} className="no-underline">
            <Pill tone={record.status === "draft" ? "amber" : "sage"}>{record.status === "draft" ? "draft ›" : "✓ done ›"}</Pill>
          </Link>
        ) : (
          past && !cancelled && <Pill>no record</Pill>
        )}
        <span className="ml-auto flex items-center gap-2">
          {big && !cancelled && !record && !running && row.consent === "signed" && occ.date === today && (
            <form action={startLesson}>
              <input type="hidden" name="student_id" value={s.id} />
              <Button className="min-h-10 px-3 text-[15px]">Start</Button>
            </form>
          )}
        </span>
      </div>
      {canChange && !occ.fallback && !past && !record && <ChangeLesson occ={occ} />}
    </li>
  );
}

function ChangeLesson({ occ }: { occ: Occurrence }) {
  // Undo for a cancel / move / one-off; otherwise cancel or move this week.
  if (occ.changeId && occ.kind !== "regular") {
    return (
      <form action={undoChange} className="mt-1">
        <input type="hidden" name="change_id" value={occ.changeId} />
        <button className="min-h-9 text-sm font-medium text-accent-ink underline">
          {occ.kind === "cancelled" ? "Undo cancel" : occ.kind === "moved" ? "Move back" : "Remove this one-off"}
        </button>
      </form>
    );
  }
  if (!occ.slotId || !occ.slotDate) return null;
  return (
    <details className="group mt-1">
      <summary className="inline-flex min-h-9 cursor-pointer list-none items-center text-sm font-medium text-accent-ink [&::-webkit-details-marker]:hidden">
        Change this week <span className="ml-1 transition-transform group-open:rotate-90" aria-hidden>›</span>
      </summary>
      <div className="mt-1 flex flex-col gap-3 rounded-xl border border-rule bg-paper p-3">
        <form action={changeLesson} className="grid gap-2 sm:grid-cols-[1.3fr_1fr_1fr_auto]">
          <input type="hidden" name="student_id" value={occ.studentId} />
          <input type="hidden" name="slot_id" value={occ.slotId} />
          <input type="hidden" name="on_date" value={occ.slotDate} />
          <input type="hidden" name="kind" value="move" />
          <Input type="date" name="new_date" aria-label="New date" defaultValue={occ.date} required />
          <Input type="time" name="new_time" aria-label="New time" defaultValue={occ.time ?? ""} required />
          <MinutesSelect value={occ.minutes} />
          <Button variant="secondary">Move</Button>
        </form>
        <form action={changeLesson}>
          <input type="hidden" name="student_id" value={occ.studentId} />
          <input type="hidden" name="slot_id" value={occ.slotId} />
          <input type="hidden" name="on_date" value={occ.slotDate} />
          <input type="hidden" name="kind" value="cancel" />
          <Button variant="danger" className="min-h-10 text-[15px]">
            Cancel this lesson
          </Button>
        </form>
      </div>
    </details>
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

// ---------- Lesson times ----------

function SlotList({ studentId, slots }: { studentId: string; slots: Slot[] }) {
  const saved = slots.filter((s) => !s.fallback && s.student_id === studentId);
  if (saved.length === 0) return <p className="mb-2 text-sm text-muted">No regular lesson yet.</p>;
  return (
    <ul className="mb-2 flex flex-col gap-1">
      {saved.map((slot) => (
        <li key={slot.id} className="flex flex-wrap items-center gap-2 text-[16px]">
          <span>
            Every {WEEKDAY_NAMES[slot.weekday]} at {formatTime(slot.start_time)}, {slot.minutes} min
            {slot.starts_on ? ` (from ${formatDate(slot.starts_on)})` : ""}
          </span>
          <form action={removeSlot} className="ml-auto">
            <input type="hidden" name="slot_id" value={slot.id} />
            <button className="min-h-9 text-sm font-medium text-danger underline">Remove</button>
          </form>
        </li>
      ))}
    </ul>
  );
}

function AddSlotForm({ student }: { student: Student }) {
  return (
    <form action={addSlot} className="grid gap-2 sm:grid-cols-[1.3fr_1fr_1fr_auto]">
      <input type="hidden" name="student_id" value={student.id} />
      <Select name="weekday" aria-label="Day" defaultValue={String(fallbackSlot(student)?.weekday ?? 1)}>
        {WEEKDAY_NAMES.map((d, i) => (
          <option key={d} value={i}>
            Every {d}
          </option>
        ))}
      </Select>
      <Input type="time" name="start_time" aria-label="Start time" required />
      <MinutesSelect />
      <Button variant="secondary">Add lesson time</Button>
    </form>
  );
}

function MinutesSelect({ value = 30 }: { value?: number }) {
  const options = Array.from(new Set([15, 20, 30, 45, 60, 75, 90, value])).sort((a, b) => a - b);
  return (
    <Select name="minutes" aria-label="Length" defaultValue={String(value)}>
      {options.map((m) => (
        <option key={m} value={m}>
          {m} min
        </option>
      ))}
    </Select>
  );
}

function WeekLink({ offset, children }: { offset: number; children: React.ReactNode }) {
  return (
    <Link href={offset === 0 ? "/downbeat" : `/downbeat?w=${offset}`} className="rounded-full px-2.5 py-1 font-medium text-accent-ink no-underline hover:bg-accent-soft">
      {children}
    </Link>
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
