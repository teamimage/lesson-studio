import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Shell } from "@/components/shell";
import { Avatar } from "@/components/avatar";
import { Card, EmptyState, LinkButton, Pill, SectionTitle } from "@/components/ui";
import { getViewer } from "@/lib/auth";
import {
  getLatestLesson,
  getPracticeWeek,
  listDraftLessons,
  listStudents,
} from "@/lib/data";
import { capitalize, formatDate, relativeDay } from "@/lib/format";

export default function Home() {
  return (
    <Shell
      title={
        <Suspense fallback="Studio">
          <StudioTitle />
        </Suspense>
      }
      eyebrow="Teacher"
      tab="studio"
      actions={
        <LinkButton href="/students/new" variant="secondary" className="min-h-9 px-3 text-sm">
          + Student
        </LinkButton>
      }
    >
      <Suspense fallback={<Skeleton />}>
        <Dashboard />
      </Suspense>
    </Shell>
  );
}

async function StudioTitle() {
  const viewer = await getViewer();
  if (!viewer.teacher) return "Studio";
  return viewer.teacher.studio_name || "Your studio";
}

async function Dashboard() {
  const viewer = await getViewer();
  if (!viewer.teacher) redirect("/family");

  const [students, drafts] = await Promise.all([listStudents(), listDraftLessons()]);
  const active = students.filter((s) => s.active);
  const rows = await Promise.all(
    active.map(async (s) => {
      const [latest, week] = await Promise.all([getLatestLesson(s.id), getPracticeWeek(s.id)]);
      return { student: s, latest, week };
    }),
  );

  const needsName = !viewer.teacher.name;

  return (
    <div className="flex flex-col gap-6">
      {needsName && (
        <Card tone="amber" className="text-sm">
          Welcome. Add your name and studio name in{" "}
          <Link href="/settings" className="font-semibold underline">
            Settings
          </Link>{" "}
          so they appear on lesson sheets.
        </Card>
      )}

      {drafts.length > 0 && (
        <section>
          <SectionTitle>Waiting for your approval</SectionTitle>
          <div className="flex flex-col gap-2">
            {drafts.map((d) => (
              <Link key={d.id} href={`/lessons/${d.id}`} className="block">
                <Card tone="amber" className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold">
                      {d.students?.name ?? "Student"}{" "}
                      <span className="font-normal text-muted">· {formatDate(d.lesson_date, "weekday")}</span>
                    </div>
                    <div className="truncate text-sm text-muted">{d.summary || "Draft lesson record"}</div>
                  </div>
                  <Pill tone="amber">Draft</Pill>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section>
        <SectionTitle
          action={
            <span className="flex items-center gap-3 text-sm text-muted">
              {active.length} {active.length === 1 ? "student" : "students"}
              {active.length > 0 && (
                <Link href="/teacher" className="font-medium text-accent-ink underline">
                  Teacher desk
                </Link>
              )}
            </span>
          }
        >
          Students
        </SectionTitle>
        {rows.length === 0 ? (
          <EmptyState
            title="No students yet"
            action={<LinkButton href="/students/new">Add your first student</LinkButton>}
          >
            Add a student, then record a lesson. The parent plan, lesson sheet and pre-lesson
            brief come from that record.
          </EmptyState>
        ) : (
          <div className="flex flex-col gap-3">
            {rows.map(({ student, latest, week }) => {
              const working = latest?.lesson_pieces.find((p) => p.activity === "started" || p.activity === "worked_on") ?? latest?.lesson_pieces[0];
              const practiceTone = week.daysPracticed >= 5 ? "sage" : week.daysPracticed >= 3 ? "amber" : "danger";
              return (
                <Card key={student.id} className="flex flex-col gap-3">
                  <div className="flex items-start gap-3">
                    <Avatar name={student.name} instrument={student.instrument} />
                    <div className="min-w-0 flex-1">
                      <Link href={`/students/${student.id}`} className="block">
                        <div className="text-[17px] font-semibold leading-tight">{student.name}</div>
                        <div className="text-sm text-muted">
                          {capitalize(student.instrument)}
                          {student.current_book ? ` · ${student.current_book}` : ""}
                        </div>
                      </Link>
                      {working && (
                        <div className="mt-1.5 text-sm">
                          <span className="text-muted">Working on </span>
                          <span className="font-medium">{working.title}</span>
                        </div>
                      )}
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <Pill tone={practiceTone}>{week.daysPracticed}/7 days practiced</Pill>
                        {week.daysListened > 0 && <Pill tone="plum">listened {week.daysListened}/7</Pill>}
                        {latest ? (
                          <Pill tone={latest.status === "draft" ? "amber" : "muted"}>
                            {latest.status === "draft" ? "draft " : "lesson "}
                            {relativeDay(latest.lesson_date)}
                          </Pill>
                        ) : (
                          <Pill>no lessons yet</Pill>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <LinkButton href={`/students/${student.id}/brief`} variant="secondary" className="min-h-10 text-sm">
                      Pre-lesson brief
                    </LinkButton>
                    <LinkButton href={`/students/${student.id}/lessons/new`} className="min-h-10 text-sm">
                      Record lesson
                    </LinkButton>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {students.some((s) => !s.active) && (
        <section>
          <SectionTitle>Inactive</SectionTitle>
          <div className="flex flex-col gap-2">
            {students
              .filter((s) => !s.active)
              .map((s) => (
                <Link key={s.id} href={`/students/${s.id}`} className="text-sm text-muted underline">
                  {s.name} · {capitalize(s.instrument)}
                </Link>
              ))}
          </div>
        </section>
      )}

      <p className="text-center text-xs text-muted">
        Signed in as {viewer.email}.{" "}
        <Link href="/family" className="underline">
          Open the home practice view
        </Link>
      </p>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="flex flex-col gap-3">
      {[0, 1].map((i) => (
        <div key={i} className="h-36 animate-pulse rounded-2xl bg-sheet" />
      ))}
    </div>
  );
}
