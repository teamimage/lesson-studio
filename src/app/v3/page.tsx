import { GradeLegend } from "@/components/grade-legend";
import Link from "next/link";
import { Suspense } from "react";
import { Shell } from "@/components/shell";
import { Me } from "@/components/v3/me";
import { Avatar } from "@/components/avatar";
import { InstrumentTag } from "@/components/instrument-tag";
import { PreLessonBrief } from "@/components/pre-lesson-brief";
import { WeekStrip } from "@/components/week-strip";
import { listLessonMarks } from "@/lib/lesson-marks";
import { PracticeSessionList } from "@/components/practice-session-list";
import { ConsentNeeded } from "@/components/consent-needed";
import { Button, Card, EmptyState, LinkButton, Pill, SectionTitle, cx } from "@/components/ui";
import { startLesson } from "@/app/lessons/live-actions";
import { openMusicStand } from "@/app/students/music-actions";
import { requireTeacher } from "@/lib/auth";
import { studentPhotoSrc } from "@/lib/constants";
import { listDraftLessons, listStudents, practiceSpanLabel, practiceTone } from "@/lib/data";
import { capitalize, formatDate, relativeDay, todayISO } from "@/lib/format";
import { listPracticeDays } from "@/lib/practice/data";
import { type TodayRow, loadTodayRow } from "@/lib/v3-data";
import { loadUpcoming } from "@/lib/schedule-data";
import { type Occurrence, cancelLabel, formatTime, isOn, nowMinutes, occurrenceRef, parseTimeText, toMinutes } from "@/lib/schedule";

type SP = Promise<{ mode?: string; s?: string }>;

/** One lesson on today's list: a scheduled lesson, or a student whose lesson day is today with no schedule entry. */
type DayEntry = { row: TodayRow; occ: Occurrence | null; time: string | null; minutes: number };

type EntryState = "running" | "done" | "off" | "next" | "missed" | "later";

/** Today's lessons in time order, cancelled ones included. */
function dayEntries(rows: TodayRow[], upcoming: Map<string, Occurrence[]>, today: string): DayEntry[] {
  const out: DayEntry[] = [];
  for (const row of rows) {
    const occs = (upcoming.get(row.student.id) ?? []).filter((o) => o.date === today);
    if (occs.length) {
      for (const occ of occs) out.push({ row, occ, time: occ.time, minutes: occ.minutes });
    } else if (row.isToday) {
      out.push({ row, occ: null, time: parseTimeText(row.student.lesson_time), minutes: 30 });
    }
  }
  return out.sort((a, b) => clock(a.time) - clock(b.time));
}

/** Where each of today's lessons stands; exactly one remaining lesson is "next". */
function entryStates(entries: DayEntry[], now = nowMinutes()): EntryState[] {
  let nextGiven = false;
  return entries.map((e) => {
    if (e.row.runningLessonId) return "running";
    if (e.row.hadLessonToday) return "done";
    if (e.occ && !isOn(e.occ)) return "off";
    const ended = e.time ? toMinutes(e.time) + e.minutes <= now : false;
    if (ended) return "missed";
    if (!nextGiven) {
      nextGiven = true;
      return "next";
    }
    return "later";
  });
}

// Today: "Your day" (the default) is the whole day on one screen: today's
// lessons in order, drafts waiting for approval, and who has practised since
// their last lesson. "Next lesson" opens the student who is up, ready to
// start, with the brief and last practice already open.
export default function TodayPage({ searchParams }: { searchParams: SP }) {
  return (
    <Shell title={<TodayTitle />} eyebrow="Today" v3Tab="today" me={<Me />} wide>
      <Suspense fallback={<Skeleton />}>
        <Body searchParams={searchParams} />
      </Suspense>
    </Shell>
  );
}

function TodayTitle() {
  return (
    <Suspense fallback="Today">
      <TodayDateTitle />
    </Suspense>
  );
}

async function TodayDateTitle() {
  // Dynamic (today's date), so it waits for the request.
  await requireTeacher();
  return formatDate(todayISO(), "long");
}

async function Body({ searchParams }: { searchParams: SP }) {
  await requireTeacher();
  const today = todayISO();
  const [{ mode: asked, s: picked }, students, drafts] = await Promise.all([
    searchParams,
    listStudents(),
    listDraftLessons(),
  ]);
  const active = students.filter((s) => s.active);
  if (active.length === 0) {
    return (
      <EmptyState title="No students yet" action={<LinkButton href="/students/new">Add your first student</LinkButton>}>
        Add a student. Today then shows your lessons, who practised and what needs your approval.
      </EmptyState>
    );
  }
  const upcoming = await loadUpcoming(active, today);
  const rows = await Promise.all(active.map((s) => loadTodayRow(s, today, upcoming.get(s.id))));
  const entries = dayEntries(rows, upcoming, today);
  const states = entryStates(entries);
  // Old links: ?mode=lesson was the next-student view, ?mode=between is now part of the day.
  const mode = asked === "next" || asked === "lesson" ? "next" : "day";
  const onToday = entries.filter((e) => !e.occ || isOn(e.occ)).length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-full border border-rule bg-sheet p-0.5 text-[15px]" role="group" aria-label="View">
          <ModeLink href="/v3" on={mode === "day"}>
            Your day
          </ModeLink>
          <ModeLink href="/v3?mode=next" on={mode === "next"}>
            Next lesson
          </ModeLink>
        </div>
        <span className="text-sm text-muted">
          {onToday > 0 ? `${onToday} lesson${onToday === 1 ? "" : "s"} today` : "No lessons today"}
          {drafts.length > 0 && ` · ${drafts.length} draft${drafts.length === 1 ? "" : "s"} to approve`}
        </span>
      </div>
      {mode === "day" ? (
        <YourDay rows={rows} entries={entries} states={states} drafts={drafts} today={today} />
      ) : (
        <NextLesson entries={entries} states={states} picked={picked} />
      )}
    </div>
  );
}

function ModeLink({ href, on, children }: { href: string; on: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      aria-current={on ? "true" : undefined}
      className={cx(
        "flex min-h-10 items-center rounded-full px-4 font-semibold",
        on ? "bg-accent-soft text-accent-ink" : "text-muted",
      )}
    >
      {children}
    </Link>
  );
}

/** "16:30" → minutes after midnight; no time sorts last. */
const clock = (t: string | null) => (t ? toMinutes(t) : 24 * 60);

/**
 * The lesson the Next lesson view opens on, from today's schedule only: the one
 * asked for, else the lesson running, else who is up. Null when nothing is left today.
 */
function pickNext(entries: DayEntry[], states: EntryState[], picked?: string): number | null {
  const asked = picked ? entries.findIndex((e) => e.row.student.id === picked) : -1;
  if (asked >= 0) return asked;
  const running = states.indexOf("running");
  if (running >= 0) return running;
  const up = states.indexOf("next");
  return up >= 0 ? up : null;
}

// ---------- Next lesson ----------

async function NextLesson({
  entries,
  states,
  picked,
}: {
  entries: DayEntry[];
  states: EntryState[];
  picked?: string;
}) {
  // Only lessons on today's schedule (a lesson already running counts); never a cancelled one or another day's.
  const keep = entries.map((e, k) => states[k] !== "off" && (!!e.occ || states[k] === "running"));
  const todays = entries.filter((_, k) => keep[k]);
  const todayStates = states.filter((_, k) => keep[k]);
  const at = pickNext(todays, todayStates, picked);
  const chips = (current: TodayRow | null) =>
    todays.length > (current ? 1 : 0) && (
      <nav aria-label="Today's lessons" className="flex flex-wrap items-center gap-2 text-[15px]">
        <span className="text-muted">Today:</span>
        {todays.map((e, k) => (
          <Link
            key={e.occ?.key ?? e.row.student.id}
            href={`/v3?mode=next&s=${e.row.student.id}`}
            aria-current={e.row === current ? "true" : undefined}
            className={cx(
              "rounded-full border px-3 py-1 no-underline",
              e.row === current ? "border-accent/40 bg-accent-soft text-accent-ink" : "border-rule text-ink",
              todayStates[k] === "done" && "text-muted",
            )}
          >
            {todayStates[k] === "done" ? "✓ " : ""}
            {e.row.student.name.split(" ")[0]}
            {e.time ? ` ${formatTime(e.time)}` : ""}
          </Link>
        ))}
      </nav>
    );
  if (at === null) {
    return (
      <div className="flex flex-col gap-4">
        {chips(null)}
        <p className="text-[17px] text-ink">
          {todays.length > 0 ? "No more lessons today." : "No lessons on today's schedule."}{" "}
          <Link href="/v3" className="text-accent-ink underline">
            See your day ›
          </Link>
        </p>
      </div>
    );
  }
  const entry = todays[at];
  const state = todayStates[at];
  const next = entry.row;
  const label =
    state === "running"
      ? "In lesson now"
      : state === "done"
        ? "Today's lesson · done"
        : `${state === "next" ? "Up next" : "Today"}${entry.time ? ` · ${formatTime(entry.time)}` : ""}`;
  const s = next.student;
  const [days, lessonDays] = next.week.days.length
    ? await Promise.all([
        listPracticeDays(s.id, next.week.days[0], next.week.days[next.week.days.length - 1]),
        listLessonMarks(s.id, next.week.days[0], next.week.days[next.week.days.length - 1]),
      ])
    : [{}, {}];

  return (
    <div className="flex flex-col gap-6">
      {chips(next)}
      <section aria-label="Next student" className="flex flex-col gap-4">
        <Card className="flex flex-col gap-4 border-accent/40">
          <div className="flex items-start gap-3">
            <Avatar name={s.name} instrument={s.instrument} photoSrc={studentPhotoSrc(s)} size="lg" />
            <div className="min-w-0 flex-1">
              <div className="text-[12px] font-semibold uppercase tracking-[0.12em] text-accent-ink">
                {label}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/v3/students/${s.id}`} className="font-display text-[28px] font-semibold leading-tight text-ink no-underline">
                  {s.name}
                </Link>
                <InstrumentTag instrument={s.instrument} />
              </div>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {s.current_book && <Pill>{s.current_book}</Pill>}
                {next.consent === "signed" ? (
                  <Pill tone="sage">✓ Consent signed</Pill>
                ) : (
                  <Pill tone="danger">Consent needed</Pill>
                )}
                <Pill tone={practiceTone(next.week)}>
                  practised {next.week.daysPracticed} of {next.week.days.length} days
                </Pill>
              </div>
            </div>
          </div>

          {next.runningLessonId ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <LinkButton href={`/lessons/${next.runningLessonId}/live`} className="min-h-14 text-lg">
                Back to the lesson
              </LinkButton>
              <LinkButton href={`/v3/lessons/${next.runningLessonId}`} variant="secondary" className="min-h-14 text-lg">
                Open today&apos;s lesson story
              </LinkButton>
            </div>
          ) : next.consent === "signed" ? (
            <form action={startLesson}>
              <input type="hidden" name="student_id" value={s.id} />
              <Button className="min-h-16 w-full text-xl">Start lesson</Button>
            </form>
          ) : (
            <ConsentNeeded
              studentId={s.id}
              studentName={s.name}
              state={next.consent}
              next={`/v3?mode=next&s=${s.id}`}
              what="starting a recorded lesson"
            />
          )}
          <div className="grid grid-cols-2 gap-2">
            <form action={openMusicStand}>
              <input type="hidden" name="student_id" value={s.id} />
              <Button variant="secondary" className="w-full">
                Music stand
              </Button>
            </form>
            <LinkButton href={`/students/${s.id}/lessons/new`} variant="secondary">
              Write up by hand
            </LinkButton>
          </div>
        </Card>

        <div className="grid gap-5 lg:grid-cols-[3fr_2fr]">
          <section className="min-w-0">
            <SectionTitle>Pre-lesson brief</SectionTitle>
            <PreLessonBrief
              student={s}
              lessons={next.lessons}
              week={next.week}
              repertoire={next.repertoire}
              showRecordButton={false}
            />
          </section>
          <section className="min-w-0">
            <SectionTitle
              action={
                <Link href={`/v3/students/${s.id}?show=practice`} className="text-sm text-accent-ink underline">
                  All practice
                </Link>
              }
            >
              Last practice
            </SectionTitle>
            <div className="flex flex-col gap-3">
              <Card>
                <div className="mb-2 text-sm font-medium text-muted">{capitalize(practiceSpanLabel(next.week))}</div>
                <WeekStrip week={next.week} days={days} lessons={lessonDays} teacherView studentId={next.student.id} />
                <GradeLegend className="mt-2" />
                <div className="mt-2 text-sm text-muted">
                  {next.week.totalMinutes} min · listened {next.week.daysListened} of {next.week.days.length} days
                </div>
                {next.week.notes.length > 0 && (
                  <ul className="mt-3 flex flex-col gap-1.5 text-sm">
                    {next.week.notes.slice(-3).map((n) => (
                      <li key={n.id} className="rounded-xl bg-plum-soft px-3 py-2">
                        <span className="font-medium text-plum">{formatDate(n.practice_date)}:</span> {n.parent_note}
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
              {next.lastSession ? (
                <PracticeSessionList sessions={[next.lastSession]} teacherView compact />
              ) : (
                <p className="px-1 text-sm text-muted">No recorded practice session yet.</p>
              )}
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}

// ---------- Your day ----------

/** One plain list frame; rows inside are divided by rules, not boxed. */
const LIST = "divide-y divide-rule overflow-hidden rounded-2xl border border-rule bg-sheet";

const STATE_TEXT: Record<EntryState, string> = {
  running: "In lesson now",
  done: "Done",
  off: "",
  next: "Up next",
  missed: "Not started",
  later: "",
};

function YourDay({
  rows,
  entries,
  states,
  drafts,
  today,
}: {
  rows: TodayRow[];
  entries: DayEntry[];
  states: EntryState[];
  drafts: Awaited<ReturnType<typeof listDraftLessons>>;
  today: string;
}) {
  // Who needs a nudge first: fewest days practised at the top.
  const practice = [...rows].sort(
    (a, b) =>
      a.week.daysPracticed / Math.max(1, a.week.days.length) - b.week.daysPracticed / Math.max(1, b.week.days.length),
  );
  const soonest = [...rows]
    .filter((r) => r.next && r.next.date > today)
    .sort((a, b) => a.next!.date.localeCompare(b.next!.date) || clock(a.next!.time) - clock(b.next!.time))[0];

  return (
    <div className="flex flex-col gap-6">
      <section>
        <SectionTitle
          action={
            <Link href="/calendar" className="text-sm text-accent-ink underline">
              Calendar
            </Link>
          }
        >
          Lessons today
        </SectionTitle>
        {entries.length === 0 ? (
          <p className="text-[16px] text-muted">
            {soonest ? (
              <>
                Nothing on today. Next is {soonest.student.name.split(" ")[0]}, {relativeDay(soonest.next!.date, today)}
                {soonest.next!.time ? ` at ${formatTime(soonest.next!.time)}` : ""}.{" "}
                <Link href={`/v3/students/${soonest.student.id}`} className="text-accent-ink underline">
                  Open {soonest.student.name.split(" ")[0]} ›
                </Link>
              </>
            ) : (
              "Nothing on today, and no lessons scheduled yet."
            )}
          </p>
        ) : (
          <div className={LIST}>
            {entries.map((e, i) => (
              <DayLesson key={e.occ?.key ?? e.row.student.id} entry={e} state={states[i]} today={today} />
            ))}
          </div>
        )}
      </section>

      {drafts.length > 0 && (
        <section>
          <SectionTitle>Waiting for your approval</SectionTitle>
          <div className={LIST}>
            {drafts.map((d) => (
              <Link key={d.id} href={`/v3/lessons/${d.id}`} className="flex items-center gap-3 px-4 py-3 no-underline">
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-ink">
                    {d.students?.name ?? "Student"}{" "}
                    <span className="font-normal text-muted">· {formatDate(d.lesson_date, "weekday")}</span>
                  </div>
                  <div className="truncate text-sm text-muted">{d.summary || "Draft lesson record"}</div>
                </div>
                <span className="text-[15px] font-semibold text-accent-ink">Review ›</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section>
        <SectionTitle>Practice since their last lesson</SectionTitle>
        <div className={LIST}>
          {practice.map((r) => (
            <PracticeRow key={r.student.id} row={r} />
          ))}
        </div>
      </section>
    </div>
  );
}

function DayLesson({ entry, state, today }: { entry: DayEntry; state: EntryState; today: string }) {
  const { row, occ, time, minutes } = entry;
  const s = row.student;
  const doneId = row.lessons.find((l) => l.lesson_date === today)?.id;
  const ref = occ && !occ.fallback ? occurrenceRef(occ) : null;
  const href =
    state === "done" && doneId
      ? `/v3/lessons/${doneId}`
      : state === "running"
        ? `/lessons/${row.runningLessonId}/live`
        : state === "off" && ref
          ? `/schedule/${ref}`
          : `/v3?mode=next&s=${s.id}`;
  const status = state === "off" ? capitalize(cancelLabel(occ!)) : STATE_TEXT[state];
  const muted = state === "off" || state === "done" || state === "missed";

  return (
    <div className={cx("px-4 py-3", state === "next" && "bg-accent-soft/40", state === "running" && "bg-sage-soft/50")}>
      <Link href={href} className="flex items-center gap-3 no-underline">
        <span className={cx("w-[60px] shrink-0 text-[15px] font-semibold", muted ? "text-muted" : "text-ink")}>
          {time ? formatTime(time) : "—"}
          {time && <span className="block text-xs font-normal text-muted">{minutes} min</span>}
        </span>
        <span className="hidden sm:block">
          <Avatar name={s.name} instrument={s.instrument} photoSrc={studentPhotoSrc(s)} />
        </span>
        <span className="min-w-0 flex-1">
          <span className={cx("block truncate text-[17px] font-semibold", state === "off" ? "text-muted line-through" : "text-ink")}>
            {s.name}
          </span>
          <span className="block text-sm text-muted">
            {capitalize(s.instrument ?? "")}
            {s.instrument ? " · " : ""}
            {row.week.daysPracticed} of {row.week.days.length} days practised
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1">
          {status && (
            <Pill tone={state === "running" ? "sage" : state === "next" ? "accent" : state === "done" ? "sage" : "muted"}>
              {state === "done" ? "✓ " : ""}
              {status}
            </Pill>
          )}
          {row.consent !== "signed" && state !== "off" && state !== "done" && <Pill tone="danger">consent needed</Pill>}
        </span>
      </Link>
      {state === "next" && row.consent === "signed" && (
        <form action={startLesson} className="mt-3">
          <input type="hidden" name="student_id" value={s.id} />
          <Button className="min-h-12 w-full">Start lesson with {s.name.split(" ")[0]}</Button>
        </form>
      )}
      {state === "running" && (
        <LinkButton href={`/lessons/${row.runningLessonId}/live`} className="mt-3 min-h-12 w-full">
          Back to the lesson
        </LinkButton>
      )}
    </div>
  );
}

function PracticeRow({ row }: { row: TodayRow }) {
  const { student: s, week, lastSession } = row;
  const grade = lastSession?.review?.grade;
  return (
    <Link href={`/v3/students/${s.id}?show=practice`} className="flex items-center gap-3 px-4 py-3 no-underline">
        <Avatar name={s.name} instrument={s.instrument} photoSrc={studentPhotoSrc(s)} />
        <div className="min-w-0 flex-1">
          <div className="text-[17px] font-semibold text-ink">{s.name}</div>
          <div className="text-sm text-muted">
            {week.daysPracticed === 0
              ? `Hasn't practised ${practiceSpanLabel(week)}`
              : `${week.daysPracticed} of ${week.days.length} days · ${week.totalMinutes} min ${practiceSpanLabel(week)}`}
          </div>
          {lastSession && (
            <div className="text-sm text-muted">
              Last recorded {relativeDay(lastSession.practice_date)}
              {grade ? ` · ${grade === "Pass" || grade === "Fail" ? grade.toLowerCase() : `grade ${grade}`}` : ""}
            </div>
          )}
        </div>
        <Pill tone={practiceTone(week)}>
          {week.daysPracticed}/{week.days.length}
        </Pill>
    </Link>
  );
}

function Skeleton() {
  return (
    <div className="flex flex-col gap-3">
      <div className="h-12 w-72 animate-pulse rounded-full bg-sheet" />
      <div className="h-56 animate-pulse rounded-2xl bg-sheet" />
      <div className="h-64 animate-pulse rounded-2xl bg-sheet" />
    </div>
  );
}
