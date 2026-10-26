import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/avatar";
import { Shell } from "@/components/shell";
import { Card, EmptyState, LinkButton, Pill, SectionTitle } from "@/components/ui";
import { requireTeacher } from "@/lib/auth";
import { getPracticeWeek, getStudent, listLessons, listParentsForStudent, listRepertoire } from "@/lib/data";
import { capitalize, formatDate, humanize } from "@/lib/format";
import { WeekStrip } from "@/components/week-strip";

type Params = Promise<{ id: string }>;

export default function StudentPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<Shell title=" " tab="studio">{null}</Shell>}>
      <Body params={params} />
    </Suspense>
  );
}

async function Body({ params }: { params: Params }) {
  await requireTeacher();
  const { id } = await params;
  const student = await getStudent(id);
  if (!student) notFound();
  const [lessons, week, repertoire, parents] = await Promise.all([
    listLessons(id),
    getPracticeWeek(id),
    listRepertoire(id),
    listParentsForStudent(id),
  ]);

  return (
    <Shell
      title={
        <span className="flex items-center gap-3">
          <Avatar name={student.name} instrument={student.instrument} />
          {student.name}
        </span>
      }
      eyebrow={`${capitalize(student.instrument)}${student.current_book ? ` · ${student.current_book}` : ""}`}
      back={{ href: "/", label: "Studio" }}
      tab="studio"
      actions={
        <Link href={`/students/${id}/edit`} className="text-sm font-medium text-accent-ink">
          Edit
        </Link>
      }
    >
      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-2 gap-2">
          <LinkButton href={`/students/${id}/brief`} variant="secondary">
            Pre-lesson brief
          </LinkButton>
          <LinkButton href={`/students/${id}/lessons/new`}>Record lesson</LinkButton>
        </div>

        <Card>
          <div className="mb-2 flex items-baseline justify-between">
            <div className="font-semibold">Practice this week</div>
            <div className="text-sm text-muted">
              {week.daysPracticed}/7 days · {week.totalMinutes} min
            </div>
          </div>
          <WeekStrip week={week} />
          {week.notes.length > 0 && (
            <ul className="mt-3 flex flex-col gap-1.5 text-sm">
              {week.notes.map((n) => (
                <li key={n.id} className="rounded-xl bg-plum-soft px-3 py-2">
                  <span className="font-medium text-plum">{formatDate(n.practice_date)}:</span> {n.parent_note}
                </li>
              ))}
            </ul>
          )}
          <Link href={`/family/${id}`} className="mt-3 inline-block text-sm text-accent-ink underline">
            Open the parent view
          </Link>
        </Card>

        {(student.goals || student.notes || student.lesson_day) && (
          <Card className="flex flex-col gap-2 text-[15px]">
            {student.lesson_day && (
              <div>
                <span className="text-muted">Lessons: </span>
                {student.lesson_day}
                {student.lesson_time ? ` at ${student.lesson_time}` : ""}
              </div>
            )}
            {student.goals && (
              <div>
                <span className="text-muted">Goals: </span>
                {student.goals}
              </div>
            )}
            {student.notes && (
              <div>
                <span className="text-muted">Private notes: </span>
                {student.notes}
              </div>
            )}
          </Card>
        )}

        <section>
          <SectionTitle>Lesson history</SectionTitle>
          {lessons.length === 0 ? (
            <EmptyState
              title="No lessons recorded yet"
              action={<LinkButton href={`/students/${id}/lessons/new`}>Record the first lesson</LinkButton>}
            />
          ) : (
            <div className="flex flex-col gap-2">
              {lessons.map((l) => (
                <Link key={l.id} href={`/lessons/${l.id}`} className="block">
                  <Card tone={l.status === "draft" ? "amber" : "sheet"} className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-semibold">{formatDate(l.lesson_date, "weekday")}</div>
                      <Pill tone={l.status === "draft" ? "amber" : "sage"}>
                        {l.status === "draft" ? "Draft" : "Approved"}
                      </Pill>
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
                </Link>
              ))}
            </div>
          )}
        </section>

        <section>
          <SectionTitle>Repertoire</SectionTitle>
          {repertoire.length === 0 ? (
            <p className="text-sm text-muted">
              Pieces appear here when a lesson record that names them is approved.
            </p>
          ) : (
            <Card className="divide-y divide-rule p-0">
              {repertoire.map((r) => (
                <div key={r.id} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{r.title}</div>
                    <div className="text-xs text-muted">
                      {r.last_played_on ? `last played ${formatDate(r.last_played_on)}` : "not played yet"}
                    </div>
                  </div>
                  <Pill tone={r.status === "learning" ? "accent" : r.status === "polishing" ? "amber" : r.status === "review" ? "sage" : "muted"}>
                    {humanize(r.status)}
                  </Pill>
                </div>
              ))}
            </Card>
          )}
        </section>

        <section>
          <SectionTitle
            action={
              <Link href={`/students/${id}/edit`} className="text-sm text-accent-ink underline">
                Manage
              </Link>
            }
          >
            Parents
          </SectionTitle>
          {parents.length === 0 ? (
            <p className="text-sm text-muted">No parent linked yet. Add one so they can see the home plan.</p>
          ) : (
            <ul className="text-[15px]">
              {parents.map((p) => (
                <li key={p.id}>
                  {p.name} <span className="text-muted">· {p.email}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Shell>
  );
}
