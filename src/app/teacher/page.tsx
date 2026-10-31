import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { Avatar } from "@/components/avatar";
import { Shell } from "@/components/shell";
import { Button, Card, EmptyState, LinkButton, Pill, SectionTitle, cx } from "@/components/ui";
import { openMusicStand } from "@/app/students/music-actions";
import { requireTeacher } from "@/lib/auth";
import {
  type PracticeLog,
  type Student,
  getPracticeWeek,
  listDraftLessons,
  listLessons,
  listParentsForStudent,
  listRepertoire,
  listStudents,
  staleReview,
} from "@/lib/data";
import { addDays, capitalize, formatDate, humanize, parseISODate, relativeDay, todayISO } from "@/lib/format";
import { RecordingList } from "@/components/recording-player";
import { listRecordingsForStudent } from "@/lib/recordings";
import { assignmentCounts, bookPosition, listPracticeRange, nextLesson, practiced } from "@/lib/teacher-data";

type SearchParams = Promise<{ student?: string }>;

// Teacher desk: every student on one screen. Pick a student in the switcher
// and their profile, lessons, assignments, practice and repertoire show in place.
export default function TeacherDesk({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Shell title="Teacher desk" eyebrow="Teacher" tab="desk" wide>
      <Suspense fallback={<Skeleton />}>
        <Desk searchParams={searchParams} />
      </Suspense>
    </Shell>
  );
}

async function Desk({ searchParams }: { searchParams: SearchParams }) {
  await requireTeacher();
  const [{ student: wanted }, students, drafts] = await Promise.all([searchParams, listStudents(), listDraftLessons()]);

  if (students.length === 0) {
    return (
      <EmptyState title="No students yet" action={<LinkButton href="/students/new">Add your first student</LinkButton>}>
        Add a student and they will show up here, one tab each.
      </EmptyState>
    );
  }

  const selected = students.find((s) => s.id === wanted) ?? students.find((s) => s.active) ?? students[0];
  const draftCount = new Map<string, number>();
  for (const d of drafts) draftCount.set(d.student_id, (draftCount.get(d.student_id) ?? 0) + 1);

  return (
    <div className="flex flex-col gap-5">
      <StudentSwitcher students={students} selectedId={selected.id} draftCount={draftCount} />
      <Suspense key={selected.id} fallback={<Skeleton />}>
        <StudentPanel student={selected} />
      </Suspense>
    </div>
  );
}

function StudentSwitcher({
  students,
  selectedId,
  draftCount,
}: {
  students: Student[];
  selectedId: string;
  draftCount: Map<string, number>;
}) {
  const active = students.filter((s) => s.active);
  const inactive = students.filter((s) => !s.active);
  return (
    <nav aria-label="Students" className="-mx-4 overflow-x-auto px-4 pb-1">
      <div className="flex w-max gap-2 rounded-2xl border border-rule bg-sheet p-1.5">
        {[...active, ...inactive].map((s) => {
          const on = s.id === selectedId;
          const drafts = draftCount.get(s.id) ?? 0;
          return (
            <Link
              key={s.id}
              href={`/teacher?student=${s.id}`}
              scroll={false}
              aria-current={on ? "page" : undefined}
              className={cx(
                "flex min-h-11 items-center gap-2 rounded-xl px-3.5 text-[15px] font-semibold transition",
                on ? "bg-accent text-white shadow-sm" : "text-ink hover:bg-accent-soft",
                !s.active && !on && "text-muted",
              )}
            >
              <span aria-hidden>{instrumentIcon(s.instrument)}</span>
              <span className="whitespace-nowrap">{s.name}</span>
              {drafts > 0 && (
                <span
                  className={cx(
                    "rounded-full px-1.5 text-[11px] font-bold",
                    on ? "bg-white/25 text-white" : "bg-amber-soft text-amber",
                  )}
                  title={`${drafts} draft${drafts === 1 ? "" : "s"} to approve`}
                >
                  {drafts}
                </span>
              )}
            </Link>
          );
        })}
        <Link
          href="/students/new"
          className="flex min-h-11 items-center rounded-xl px-3 text-sm font-semibold text-accent-ink hover:bg-accent-soft"
        >
          + Add
        </Link>
      </div>
    </nav>
  );
}

async function StudentPanel({ student }: { student: Student }) {
  const id = student.id;
  const today = todayISO();
  const [lessons, week, month, repertoire, parents, recordings] = await Promise.all([
    listLessons(id, 20),
    getPracticeWeek(id),
    listPracticeRange(id, 28),
    listRepertoire(id),
    listParentsForStudent(id),
    listRecordingsForStudent(id, 3),
  ]);

  const latest = lessons[0] ?? null;
  const plan = lessons.find((l) => l.status === "approved") ?? null;
  const drafts = lessons.filter((l) => l.status === "draft");
  const upcoming = nextLesson(student, latest, today);
  const sincePlan = plan ? month.filter((l) => l.practice_date >= plan.lesson_date) : [];
  const counts = plan ? assignmentCounts(plan.assignments, sincePlan) : new Map<string, number>();
  const daysSincePlan = plan ? Math.max(1, Math.min(28, Math.round((parseISODate(today).getTime() - parseISODate(plan.lesson_date).getTime()) / 86_400_000))) : 0;
  const position = bookPosition(student.instrument, student.current_book, repertoire);
  const working = repertoire.filter((r) => r.status === "learning" || r.status === "polishing" || r.status === "preview");
  const stale = staleReview(repertoire, today);
  const reviewCount = repertoire.filter((r) => r.status === "review" || r.status === "performed").length;
  const monthDays = month.filter((l) => practiced(l)).length;
  const practiceTone = week.daysPracticed >= 5 ? "sage" : week.daysPracticed >= 3 ? "amber" : "danger";

  return (
    <div className="flex flex-col gap-5">
      {/* Header: who, when, and the main actions */}
      <Card className="flex flex-col gap-4">
        <div className="flex items-start gap-3">
          <Avatar name={student.name} instrument={student.instrument} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-2xl font-semibold leading-tight">{student.name}</h2>
              {!student.active && <Pill>inactive</Pill>}
            </div>
            <div className="text-sm text-muted">
              {capitalize(student.instrument)}
              {student.age ? ` · age ${student.age}` : ""}
              {student.method ? ` · ${humanize(student.method)}` : ""}
              {student.current_book ? ` · ${student.current_book}` : ""}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {upcoming ? (
                <Pill tone="accent">
                  Next lesson {relativeDay(upcoming.date, today)}
                  {upcoming.date !== today && relativeDay(upcoming.date, today) !== formatDate(upcoming.date)
                    ? ` · ${formatDate(upcoming.date, "weekday")}`
                    : ""}
                  {student.lesson_time ? ` · ${student.lesson_time}` : ""}
                </Pill>
              ) : (
                <Pill>No lesson day set</Pill>
              )}
              <Pill tone={practiceTone}>{week.daysPracticed}/7 days practiced</Pill>
              {drafts.length > 0 && <Pill tone="amber">{drafts.length} draft{drafts.length === 1 ? "" : "s"} to approve</Pill>}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <LinkButton href={`/students/${id}/lessons/new`} className="text-sm">
            Record lesson
          </LinkButton>
          <LinkButton href={`/students/${id}/brief`} variant="secondary" className="text-sm">
            Pre-lesson brief
          </LinkButton>
          {plan ? (
            <LinkButton href={`/lessons/${plan.id}/sheet`} variant="secondary" className="text-sm">
              Printable sheet
            </LinkButton>
          ) : (
            <span className="inline-flex min-h-11 items-center justify-center rounded-xl border border-dashed border-rule text-sm text-muted">
              No sheet yet
            </span>
          )}
          <LinkButton href={`/students/${id}`} variant="secondary" className="text-sm">
            Full profile
          </LinkButton>
          <form action={openMusicStand} className="col-span-2 sm:col-span-2">
            <input type="hidden" name="student_id" value={id} />
            <Button variant="secondary" className="w-full text-sm">
              Open music stand
            </Button>
          </form>
          <LinkButton href={`/students/${id}/music`} variant="secondary" className="col-span-2 text-sm sm:col-span-2">
            Music for the stand
          </LinkButton>
        </div>
      </Card>

      {/* At a glance */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="This week" value={`${week.daysPracticed}/7 days`} detail={`${week.totalMinutes} min · listened ${week.daysListened}/7`} />
        <Stat label="Last 4 weeks" value={`${monthDays}/28 days`} detail={`${month.reduce((n, l) => n + (l.minutes ?? 0), 0)} min logged`} />
        <Stat
          label="Last lesson"
          value={latest ? relativeDay(latest.lesson_date, today) : "None yet"}
          detail={latest ? `${formatDate(latest.lesson_date, "weekday")} · ${latest.status === "draft" ? "draft" : "approved"}` : "Record the first one"}
        />
        <Stat
          label="Repertoire"
          value={`${working.length} in progress`}
          detail={`${reviewCount} in review${stale.length ? ` · ${stale.length} need a look` : ""}`}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        {/* Left column: this week's work and the lesson record */}
        <div className="flex min-w-0 flex-col gap-5">
          {drafts.length > 0 && (
            <section>
              <SectionTitle>Waiting for your approval</SectionTitle>
              <div className="flex flex-col gap-2">
                {drafts.map((d) => (
                  <Link key={d.id} href={`/lessons/${d.id}`} className="block">
                    <Card tone="amber" className="flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold">{formatDate(d.lesson_date, "weekday")}</div>
                        <div className="truncate text-sm text-muted">{d.summary || "Draft lesson record"}</div>
                      </div>
                      <span className="text-sm font-semibold text-accent-ink">Review ›</span>
                    </Card>
                  </Link>
                ))}
              </div>
            </section>
          )}

          <section>
            <SectionTitle
              action={
                plan && (
                  <span className="text-sm text-muted">from {formatDate(plan.lesson_date, "weekday")}</span>
                )
              }
            >
              Current assignments
            </SectionTitle>
            {!plan || plan.assignments.length === 0 ? (
              <EmptyState title="Nothing assigned yet">
                Assignments appear here once a lesson with practice items is approved.
              </EmptyState>
            ) : (
              <ol className="flex flex-col gap-2">
                {plan.assignments.map((a) => {
                  const done = counts.get(a.id) ?? 0;
                  const pct = Math.min(100, Math.round((done / daysSincePlan) * 100));
                  return (
                    <li key={a.id} className="rounded-2xl border border-rule bg-sheet p-3">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-medium">{a.title}</span>
                        <Pill tone={a.kind === "listening" ? "plum" : a.kind === "review" ? "sage" : a.kind === "piece" ? "accent" : "amber"}>
                          {a.kind}
                        </Pill>
                        <span className="ml-auto text-sm tabular-nums text-muted">
                          {done}/{daysSincePlan} {daysSincePlan === 1 ? "day" : "days"}
                        </span>
                      </div>
                      {a.how && <div className="mt-0.5 text-sm text-muted">{a.how}</div>}
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-rule/60">
                        <div className="h-full rounded-full bg-sage" style={{ width: `${pct}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>

          <section>
            <SectionTitle
              action={
                <Link href={`/family/${id}`} className="text-sm text-accent-ink underline">
                  Parent view
                </Link>
              }
            >
              Home practice
            </SectionTitle>
            <Card className="flex flex-col gap-3">
              <PracticeGrid logs={month} today={today} />
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                <span className="flex items-center gap-1.5">
                  <span className="h-3 w-3 rounded bg-sage" /> practiced
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-3 w-3 rounded bg-sage/40" /> under 10 min
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-plum" /> listened
                </span>
              </div>
              {month.some((l) => l.parent_note?.trim()) && (
                <ul className="flex flex-col gap-1.5 text-sm">
                  {month
                    .filter((l) => l.parent_note?.trim())
                    .slice(-4)
                    .reverse()
                    .map((n) => (
                      <li key={n.id} className="rounded-xl bg-plum-soft px-3 py-2">
                        <span className="font-medium text-plum">{formatDate(n.practice_date)}:</span> {n.parent_note}
                      </li>
                    ))}
                </ul>
              )}
            </Card>
          </section>

          <section>
            <SectionTitle
              action={
                <Link href={`/students/${id}`} className="text-sm text-accent-ink underline">
                  All lessons
                </Link>
              }
            >
              Recent lessons
            </SectionTitle>
            {lessons.length === 0 ? (
              <EmptyState
                title="No lessons recorded yet"
                action={<LinkButton href={`/students/${id}/lessons/new`}>Record the first lesson</LinkButton>}
              />
            ) : (
              <div className="flex flex-col gap-2">
                {lessons.slice(0, 5).map((l) => (
                  <Card key={l.id} tone={l.status === "draft" ? "amber" : "sheet"} className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <Link href={`/lessons/${l.id}`} className="font-semibold hover:underline">
                        {formatDate(l.lesson_date, "weekday")}
                      </Link>
                      <div className="flex items-center gap-2">
                        {l.status === "approved" && (
                          <Link href={`/lessons/${l.id}/sheet`} className="text-xs font-medium text-accent-ink underline">
                            Sheet
                          </Link>
                        )}
                        <Pill tone={l.status === "draft" ? "amber" : "sage"}>
                          {l.status === "draft" ? "Draft" : "Approved"}
                        </Pill>
                      </div>
                    </div>
                    {l.summary && <p className="line-clamp-2 text-sm text-muted">{l.summary}</p>}
                    {l.lesson_pieces.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {l.lesson_pieces.map((p) => (
                          <Pill key={p.id} tone="accent">
                            {p.title}
                          </Pill>
                        ))}
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Right column: recordings, profile and repertoire */}
        <div className="flex min-w-0 flex-col gap-5">
          <section>
            <SectionTitle
              action={
                latest && (
                  <Link href={`/lessons/${latest.id}#recordings`} className="text-sm text-accent-ink underline">
                    Upload
                  </Link>
                )
              }
            >
              Recordings
            </SectionTitle>
            {recordings.length === 0 ? (
              <p className="text-sm text-muted">
                {latest
                  ? "No videos yet. Upload one on the lesson it belongs to."
                  : "Record a lesson first, then upload its video there."}
              </p>
            ) : (
              <RecordingList recordings={recordings} />
            )}
          </section>

          <section>
            <SectionTitle
              action={
                <Link href={`/students/${id}/edit`} className="text-sm text-accent-ink underline">
                  Edit
                </Link>
              }
            >
              Student
            </SectionTitle>
            <Card className="flex flex-col divide-y divide-rule p-0 text-[15px]">
              <Info label="Lessons">
                {student.lesson_day ? `${student.lesson_day}${student.lesson_time ? ` at ${student.lesson_time}` : ""}` : "Not set"}
                {upcoming && (
                  <div className="text-sm text-muted">
                    Next: {formatDate(upcoming.date, "long")}
                    {upcoming.source === "set" ? " (set on last lesson)" : ""}
                  </div>
                )}
              </Info>
              <Info label="Parents">
                {parents.length === 0 ? (
                  <span className="text-muted">None linked yet</span>
                ) : (
                  parents.map((p) => (
                    <div key={p.id}>
                      {p.name} <span className="text-sm text-muted">· {p.email}</span>
                    </div>
                  ))
                )}
              </Info>
              {student.goals && <Info label="Goals">{student.goals}</Info>}
              {student.notes && <Info label="Private notes">{student.notes}</Info>}
              {plan?.focus_points && <Info label="Last focus">{plan.focus_points}</Info>}
            </Card>
          </section>

          <section>
            <SectionTitle
              action={
                <Link href={`/students/${id}#repertoire`} className="text-sm text-accent-ink underline">
                  Full map
                </Link>
              }
            >
              Repertoire
            </SectionTitle>
            <Card className="flex flex-col gap-3">
              {position && (
                <div>
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="font-semibold">{position.book}</div>
                    <div className="text-sm tabular-nums text-muted">
                      {position.inReview}/{position.total} in review
                    </div>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-rule/60">
                    <div
                      className="h-full rounded-full bg-accent"
                      style={{ width: `${Math.round((position.inReview / Math.max(1, position.total)) * 100)}%` }}
                    />
                  </div>
                  {position.nextPiece && (
                    <div className="mt-1.5 text-sm text-muted">
                      Next new piece: <span className="font-medium text-ink">{position.nextPiece}</span>
                    </div>
                  )}
                </div>
              )}
              <div>
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-accent-ink">Working on</div>
                {working.length === 0 ? (
                  <p className="text-sm text-muted">Nothing in progress.</p>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {working.map((r) => (
                      <li key={r.id} className="flex items-center justify-between gap-2 text-[15px]">
                        <span className="truncate">{r.title}</span>
                        <Pill tone={r.status === "polishing" ? "amber" : r.status === "preview" ? "plum" : "accent"}>
                          {humanize(r.status)}
                        </Pill>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {stale.length > 0 && (
                <div>
                  <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-accent-ink">
                    Review needs a look
                  </div>
                  <ul className="flex flex-col gap-1">
                    {stale.slice(0, 5).map((r) => (
                      <li key={r.id} className="flex items-center justify-between gap-2 text-[15px]">
                        <span className="truncate">{r.title}</span>
                        <span className="shrink-0 text-xs text-muted">
                          {r.daysSince === null ? "never logged" : `${r.daysSince} days`}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>
          </section>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-2xl border border-rule bg-sheet px-3 py-2.5">
      <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-accent-ink">{label}</div>
      <div className="mt-0.5 text-lg font-semibold leading-tight">{value}</div>
      <div className="text-xs text-muted">{detail}</div>
    </div>
  );
}

function Info({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[96px_1fr] gap-3 px-4 py-2.5">
      <div className="pt-0.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-accent-ink">{label}</div>
      <div className="min-w-0 whitespace-pre-line">{children}</div>
    </div>
  );
}

// Four weeks of practice, one row per week, oldest at the top.
function PracticeGrid({ logs, today }: { logs: PracticeLog[]; today: string }) {
  const start = addDays(today, -27);
  const weeks = Array.from({ length: 4 }, (_, w) => Array.from({ length: 7 }, (_, d) => addDays(start, w * 7 + d)));
  return (
    <div className="flex flex-col gap-1.5">
      <div className="grid grid-cols-[52px_repeat(7,minmax(0,1fr))] gap-1.5 text-center text-[11px] text-muted">
        <span />
        {weeks[0].map((d) => (
          <span key={d}>{parseISODate(d).toLocaleDateString("en-US", { weekday: "narrow" })}</span>
        ))}
      </div>
      {weeks.map((days) => (
        <div key={days[0]} className="grid grid-cols-[52px_repeat(7,minmax(0,1fr))] items-center gap-1.5">
          <span className="text-[11px] text-muted">{formatDate(days[0])}</span>
          {days.map((d) => {
            const log = logs.find((l) => l.practice_date === d);
            const did = practiced(log);
            const short = did && (log?.minutes ?? 0) > 0 && (log?.minutes ?? 0) < 10;
            return (
              <div
                key={d}
                title={`${formatDate(d, "weekday")}${log?.minutes ? ` · ${log.minutes} min` : ""}${log?.listened ? " · listened" : ""}`}
                className={cx(
                  "relative flex h-8 items-center justify-center rounded-lg text-[11px] font-semibold",
                  did ? (short ? "bg-sage/40 text-ink" : "bg-sage text-white") : "bg-rule/50 text-muted",
                  d === today && "ring-2 ring-accent",
                )}
              >
                {log?.minutes ? log.minutes : ""}
                {log?.listened && <span className="absolute bottom-0.5 h-1 w-1 rounded-full bg-plum" />}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function instrumentIcon(instrument: string) {
  return instrument === "piano" ? "🎹" : ["cello", "violin", "viola"].includes(instrument) ? "🎻" : instrument === "guitar" ? "🎸" : instrument === "voice" ? "🎤" : "🎵";
}

function Skeleton() {
  return (
    <div className="flex flex-col gap-3">
      <div className="h-14 animate-pulse rounded-2xl bg-sheet" />
      <div className="h-40 animate-pulse rounded-2xl bg-sheet" />
      <div className="h-64 animate-pulse rounded-2xl bg-sheet" />
    </div>
  );
}
