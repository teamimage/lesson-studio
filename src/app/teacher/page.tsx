import { listScoreIndex } from "@/lib/scores";
import { MusicPreviewLinks } from "@/components/music-preview-links";
import Link from "next/link";
import { Suspense } from "react";
import { Avatar } from "@/components/avatar";
import { DeskLink, PracticeGrid, Stat } from "@/components/desk";
import { Shell } from "@/components/shell";
import { StudentPicker } from "@/components/student-picker";
import { Button, Card, EmptyState, LinkButton, Pill, SectionTitle } from "@/components/ui";
import { openMusicStand } from "@/app/students/music-actions";
import { requireTeacher } from "@/lib/auth";
import {
  type Student,
  getPracticeWeek,
  listDraftLessons,
  listLessons,
  listRepertoire,
  listStudents,
  staleReview,
} from "@/lib/data";
import { capitalize, formatDate, humanize, parseISODate, relativeDay, todayISO } from "@/lib/format";
import { listRecordingsForStudent } from "@/lib/recordings";
import { assignmentCounts, listPracticeRange, nextLesson, practiced } from "@/lib/teacher-data";

type SearchParams = Promise<{ student?: string }>;

// Teacher desk: pick a student from the dropdown and see what matters for
// the next lesson. Profile, repertoire and videos open on their own pages.
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
        Add a student and choose them here to see their lessons, practice and videos.
      </EmptyState>
    );
  }

  const selected = students.find((s) => s.id === wanted) ?? students.find((s) => s.active) ?? students[0];
  const draftCount = new Map<string, number>();
  for (const d of drafts) draftCount.set(d.student_id, (draftCount.get(d.student_id) ?? 0) + 1);
  const ordered = [...students.filter((s) => s.active), ...students.filter((s) => !s.active)];

  return (
    <div className="flex flex-col gap-5">
      <StudentPicker
        selectedId={selected.id}
        students={ordered.map((s) => ({
          id: s.id,
          name: s.name,
          instrument: s.instrument,
          active: s.active,
          drafts: draftCount.get(s.id) ?? 0,
        }))}
      />
      <Suspense key={selected.id} fallback={<Skeleton />}>
        <StudentPanel student={selected} />
      </Suspense>
    </div>
  );
}

async function StudentPanel({ student }: { student: Student }) {
  const id = student.id;
  const today = todayISO();
  const [lessons, week, month, repertoire, recordings, music] = await Promise.all([
    listLessons(id, 20),
    getPracticeWeek(id),
    listPracticeRange(id, 28),
    listRepertoire(id),
    listRecordingsForStudent(id, 50),
    listScoreIndex(id),
  ]);

  const latest = lessons[0] ?? null;
  const plan = lessons.find((l) => l.status === "approved") ?? null;
  const drafts = lessons.filter((l) => l.status === "draft");
  const upcoming = nextLesson(student, latest, today);
  const sincePlan = plan ? month.filter((l) => l.practice_date >= plan.lesson_date) : [];
  const counts = plan ? assignmentCounts(plan.assignments, sincePlan) : new Map<string, number>();
  const daysSincePlan = plan ? Math.max(1, Math.min(28, Math.round((parseISODate(today).getTime() - parseISODate(plan.lesson_date).getTime()) / 86_400_000))) : 0;
  const working = repertoire.filter((r) => r.status === "learning" || r.status === "polishing" || r.status === "preview");
  const stale = staleReview(repertoire, today);
  const reviewCount = repertoire.filter((r) => r.status === "review" || r.status === "performed").length;
  const monthDays = month.filter((l) => practiced(l)).length;

  return (
    <div className="flex flex-col gap-6">
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
                  {student.lesson_time ? ` · ${student.lesson_time}` : ""}
                </Pill>
              ) : (
                <Pill>No lesson day set</Pill>
              )}
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
          <form action={openMusicStand}>
            <input type="hidden" name="student_id" value={id} />
            <Button variant="secondary" className="w-full text-sm">
              Open music stand
            </Button>
          </form>
        </div>
        <MusicPreviewLinks studentId={id} scores={music} />
        <div className="grid gap-2 sm:grid-cols-2">
          <DeskLink
            href={`/teacher/${id}`}
            title="View student"
            detail="Profile, parents, goals and repertoire"
          />
          <DeskLink
            href={`/teacher/${id}/recordings`}
            title="Recordings"
            detail={
              recordings.length === 0
                ? "Upload and watch lesson videos"
                : `${recordings.length} video${recordings.length === 1 ? "" : "s"} · upload more`
            }
          />
        </div>
      </Card>

      {/* At a glance */}
      <section>
        <SectionTitle>At a glance</SectionTitle>
        <p className="-mt-1 mb-2 text-sm text-muted">
          Quick numbers for {student.name}: how often they practiced at home, when the last lesson was, and where their
          pieces stand.
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Practice this week" value={`${week.daysPracticed} of 7 days`} detail={`${week.totalMinutes} min · listened ${week.daysListened} of 7`} />
          <Stat label="Practice, last 4 weeks" value={`${monthDays} of 28 days`} detail={`${month.reduce((n, l) => n + (l.minutes ?? 0), 0)} min logged`} />
          <Stat
            label="Last lesson"
            value={latest ? capitalize(relativeDay(latest.lesson_date, today)) : "None yet"}
            detail={latest ? `${formatDate(latest.lesson_date, "weekday")} · ${latest.status === "draft" ? "draft" : "approved"}` : "Record the first one"}
          />
          <Stat
            label="Pieces"
            value={`${working.length} in progress`}
            detail={`${reviewCount} in review${stale.length ? ` · ${stale.length} need a look` : ""}`}
          />
        </div>
      </section>

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

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="min-w-0">
          <SectionTitle
            action={plan && <span className="text-sm text-muted">from {formatDate(plan.lesson_date, "weekday")}</span>}
          >
            Current assignments
          </SectionTitle>
          <p className="-mt-1 mb-2 text-sm text-muted">
            What you gave for home practice at the last approved lesson, and how many days each item was done since.
          </p>
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
                        {done} of {daysSincePlan} {daysSincePlan === 1 ? "day" : "days"}
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

        <section className="min-w-0">
          <SectionTitle
            action={
              <Link href={`/family/${id}`} className="text-sm text-accent-ink underline">
                Open parent view
              </Link>
            }
          >
            Home practice
          </SectionTitle>
          <p className="-mt-1 mb-2 text-sm text-muted">
            The practice the parent checks off at home each day, from the Home practice tab. Each box is one day: green
            means they practiced (the number is minutes), a purple dot means they listened to the recording.
          </p>
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
                  .slice(-3)
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
      </div>

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
          <div className="grid gap-2 lg:grid-cols-3">
            {lessons.slice(0, 3).map((l) => (
              <Link key={l.id} href={`/lessons/${l.id}`} className="block">
                <Card tone={l.status === "draft" ? "amber" : "sheet"} className="flex h-full flex-col gap-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{formatDate(l.lesson_date, "weekday")}</span>
                    <Pill tone={l.status === "draft" ? "amber" : "sage"}>{l.status === "draft" ? "Draft" : "Approved"}</Pill>
                  </div>
                  {l.summary && <p className="line-clamp-2 text-sm text-muted">{l.summary}</p>}
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="flex flex-col gap-3">
      <div className="h-14 animate-pulse rounded-2xl bg-sheet sm:w-80" />
      <div className="h-48 animate-pulse rounded-2xl bg-sheet" />
      <div className="h-64 animate-pulse rounded-2xl bg-sheet" />
    </div>
  );
}
