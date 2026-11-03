import Link from "next/link";
import { Suspense } from "react";
import { Shell } from "@/components/shell";
import { Me } from "@/components/v3/me";
import { Avatar } from "@/components/avatar";
import { InstrumentTag } from "@/components/instrument-tag";
import { PreLessonBrief } from "@/components/pre-lesson-brief";
import { WeekStrip } from "@/components/week-strip";
import { PracticeSessionList } from "@/components/practice-session-list";
import { ConsentNeeded } from "@/components/consent-needed";
import { Fold } from "@/components/fold";
import { Button, Card, EmptyState, LinkButton, Pill, SectionTitle, cx } from "@/components/ui";
import { startLesson } from "@/app/lessons/live-actions";
import { openMusicStand } from "@/app/students/music-actions";
import { requireTeacher } from "@/lib/auth";
import { studentPhotoSrc } from "@/lib/constants";
import { listDraftLessons, listStudents, practiceSpanLabel, practiceTone } from "@/lib/data";
import { capitalize, formatDate, relativeDay, todayISO } from "@/lib/format";
import { listPracticeDays } from "@/lib/practice/data";
import { type TodayRow, lessonMinutes, loadTodayRow } from "@/lib/v3-data";

type SP = Promise<{ mode?: string }>;

// Version 3: one Today screen in place of Desk. On a lesson day it opens on
// the next student, ready to start, with the brief and last practice already
// open. Between lessons it shows who practised, who hasn't, and drafts
// waiting for approval.
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
  const [{ mode: asked }, students, drafts] = await Promise.all([searchParams, listStudents(), listDraftLessons()]);
  const active = students.filter((s) => s.active);
  if (active.length === 0) {
    return (
      <EmptyState title="No students yet" action={<LinkButton href="/students/new">Add your first student</LinkButton>}>
        Add a student. Today then shows who has a lesson, who practised and what needs your approval.
      </EmptyState>
    );
  }
  const rows = await Promise.all(active.map((s) => loadTodayRow(s, today)));
  const todays = rows
    .filter((r) => r.isToday)
    .sort((a, b) => lessonMinutes(a.student.lesson_time) - lessonMinutes(b.student.lesson_time));
  const mode = asked === "lesson" || asked === "between" ? asked : todays.length > 0 ? "lesson" : "between";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-full border border-rule bg-sheet p-0.5 text-[15px]" role="group" aria-label="View">
          <ModeLink href="/v3?mode=lesson" on={mode === "lesson"}>
            Lesson day
          </ModeLink>
          <ModeLink href="/v3?mode=between" on={mode === "between"}>
            Between lessons
          </ModeLink>
        </div>
        <span className="text-sm text-muted">
          {todays.length > 0
            ? `${todays.length} lesson${todays.length === 1 ? "" : "s"} today`
            : "No lessons today"}
          {drafts.length > 0 && ` · ${drafts.length} draft${drafts.length === 1 ? "" : "s"} to approve`}
        </span>
      </div>
      {mode === "lesson" ? (
        <LessonDay rows={rows} todays={todays} today={today} drafts={drafts.length} />
      ) : (
        <Between rows={rows} drafts={drafts} today={today} />
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

// ---------- Lesson day ----------

async function LessonDay({
  rows,
  todays,
  today,
  drafts,
}: {
  rows: TodayRow[];
  todays: TodayRow[];
  today: string;
  drafts: number;
}) {
  // Nobody today (the view was picked by hand): show the soonest student so
  // the layout can still be seen.
  const preview = todays.length === 0;
  const list = preview
    ? [...rows].sort((a, b) => (a.next?.date ?? "9999").localeCompare(b.next?.date ?? "9999")).slice(0, 1)
    : todays;
  const next = list.find((r) => !r.hadLessonToday) ?? list[list.length - 1];
  const others = list.filter((r) => r !== next);
  const s = next.student;
  const days = next.week.days.length
    ? await listPracticeDays(s.id, next.week.days[0], next.week.days[next.week.days.length - 1])
    : {};

  return (
    <div className="flex flex-col gap-6">
      {preview && (
        <Card tone="amber" className="text-[16px]">
          Nobody has a lesson today. This is how lesson day will look, shown for {s.name.split(" ")[0]}
          {next.next ? `, whose next lesson is ${relativeDay(next.next.date, today)}` : ""}.
        </Card>
      )}

      <section aria-label="Next student" className="flex flex-col gap-4">
        <Card className="flex flex-col gap-4 border-accent/40">
          <div className="flex items-start gap-3">
            <Avatar name={s.name} instrument={s.instrument} photoSrc={studentPhotoSrc(s)} size="lg" />
            <div className="min-w-0 flex-1">
              <div className="text-[12px] font-semibold uppercase tracking-[0.12em] text-accent-ink">
                {next.hadLessonToday ? "Today's lesson" : "Up next"}
                {s.lesson_time ? ` · ${s.lesson_time}` : ""}
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
              next="/v3?mode=lesson"
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
                <WeekStrip week={next.week} days={days} teacherView />
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

      {others.length > 0 && (
        <section>
          <SectionTitle>Also today</SectionTitle>
          <div className="flex flex-col gap-3">
            {others.map((r) => (
              <Fold
                key={r.student.id}
                title={
                  <span className="flex items-center gap-2">
                    {r.student.name}
                    {r.hadLessonToday && <Pill tone="sage">done</Pill>}
                  </span>
                }
                meta={[r.student.lesson_time, r.consent === "signed" ? "" : "consent needed"].filter(Boolean).join(" · ")}
              >
                {r.consent === "signed" ? (
                  <form action={startLesson}>
                    <input type="hidden" name="student_id" value={r.student.id} />
                    <Button className="min-h-12 w-full">Start lesson</Button>
                  </form>
                ) : (
                  <ConsentNeeded
                    studentId={r.student.id}
                    studentName={r.student.name}
                    state={r.consent}
                    next="/v3?mode=lesson"
                    what="starting a recorded lesson"
                  />
                )}
                <PreLessonBrief
                  student={r.student}
                  lessons={r.lessons}
                  week={r.week}
                  repertoire={r.repertoire}
                  showRecordButton={false}
                />
              </Fold>
            ))}
          </div>
        </section>
      )}

      {drafts > 0 && (
        <Link href="/v3?mode=between" className="text-sm text-accent-ink underline">
          {drafts} draft{drafts === 1 ? "" : "s"} waiting for approval ›
        </Link>
      )}
    </div>
  );
}

// ---------- Between lessons ----------

function Between({
  rows,
  drafts,
  today,
}: {
  rows: TodayRow[];
  drafts: Awaited<ReturnType<typeof listDraftLessons>>;
  today: string;
}) {
  const practised = rows.filter((r) => r.week.daysPracticed > 0);
  const notYet = rows.filter((r) => r.week.daysPracticed === 0);
  const coming = rows
    .filter((r) => r.next)
    .sort((a, b) => a.next!.date.localeCompare(b.next!.date) || lessonMinutes(a.student.lesson_time) - lessonMinutes(b.student.lesson_time));

  return (
    <div className="flex flex-col gap-6">
      <section>
        <SectionTitle>Waiting for your approval</SectionTitle>
        {drafts.length === 0 ? (
          <p className="text-[16px] text-muted">Nothing waiting. Every lesson is approved.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {drafts.map((d) => (
              <Link key={d.id} href={`/v3/lessons/${d.id}`} className="block">
                <Card tone="amber" className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold">
                      {d.students?.name ?? "Student"}{" "}
                      <span className="font-normal text-muted">· {formatDate(d.lesson_date, "weekday")}</span>
                    </div>
                    <div className="truncate text-sm text-muted">{d.summary || "Draft lesson record"}</div>
                  </div>
                  <span className="text-[16px] font-semibold text-accent-ink">Review ›</span>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="min-w-0">
          <SectionTitle>Practised since their lesson</SectionTitle>
          {practised.length === 0 ? (
            <p className="text-[16px] text-muted">Nobody yet.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {practised.map((r) => (
                <PracticeRow key={r.student.id} row={r} />
              ))}
            </div>
          )}
        </section>
        <section className="min-w-0">
          <SectionTitle>Hasn&apos;t practised yet</SectionTitle>
          {notYet.length === 0 ? (
            <p className="text-[16px] text-muted">Everyone has practised at least once.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {notYet.map((r) => (
                <PracticeRow key={r.student.id} row={r} />
              ))}
            </div>
          )}
        </section>
      </div>

      <section>
        <SectionTitle>Coming up</SectionTitle>
        {coming.length === 0 ? (
          <p className="text-[16px] text-muted">No lesson days set. Add one on a student&apos;s profile.</p>
        ) : (
          <Card className="divide-y divide-rule p-0">
            {coming.map((r) => (
              <Link key={r.student.id} href={`/v3/students/${r.student.id}`} className="flex items-center gap-3 px-4 py-3">
                <span className="w-32 shrink-0 font-semibold">
                  {capitalize(relativeDay(r.next!.date, today))}
                  {r.student.lesson_time && <span className="block text-sm font-normal text-muted">{r.student.lesson_time}</span>}
                </span>
                <span className="min-w-0 flex-1 truncate text-[17px]">{r.student.name}</span>
                {r.consent !== "signed" && <Pill tone="danger">consent needed</Pill>}
                <span className="text-accent-ink" aria-hidden>
                  ›
                </span>
              </Link>
            ))}
          </Card>
        )}
      </section>
    </div>
  );
}

function PracticeRow({ row }: { row: TodayRow }) {
  const { student: s, week, lastSession } = row;
  const grade = lastSession?.review?.grade;
  return (
    <Link href={`/v3/students/${s.id}?show=practice`} className="block">
      <Card className="flex items-center gap-3 py-3">
        <Avatar name={s.name} instrument={s.instrument} photoSrc={studentPhotoSrc(s)} />
        <div className="min-w-0 flex-1">
          <div className="text-[17px] font-semibold">{s.name}</div>
          <div className="text-sm text-muted">
            {week.daysPracticed} of {week.days.length} days · {week.totalMinutes} min {practiceSpanLabel(week)}
          </div>
          {lastSession && (
            <div className="text-sm text-muted">
              Last recorded {relativeDay(lastSession.practice_date)}
              {grade ? ` · grade ${grade}` : ""}
            </div>
          )}
        </div>
        <Pill tone={practiceTone(week)}>
          {week.daysPracticed}/{week.days.length}
        </Pill>
      </Card>
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
