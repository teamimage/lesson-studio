import { listScoreIndex } from "@/lib/scores";
import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/avatar";
import { InstrumentTag } from "@/components/instrument-tag";
import { studentPhotoSrc } from "@/lib/constants";
import { Info } from "@/components/desk";
import { RepertoireMap } from "@/components/repertoire-map";
import { Shell } from "@/components/shell";
import { Card, LinkButton, Pill, SectionTitle } from "@/components/ui";
import { requireTeacher } from "@/lib/auth";
import { getStudent, listLessons, listParentsForStudent, listRepertoire, staleReview } from "@/lib/data";
import { capitalize, formatDate, humanize, todayISO } from "@/lib/format";
import { bookPosition, nextLesson } from "@/lib/teacher-data";

type Params = Promise<{ id: string }>;

// "View student" from the teacher desk: profile, parents and repertoire.
export default function DeskStudentPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<Shell title=" " tab="desk" back={{ href: "/teacher", label: "Teacher desk" }} wide>{null}</Shell>}>
      <Body params={params} />
    </Suspense>
  );
}

async function Body({ params }: { params: Params }) {
  await requireTeacher();
  const { id } = await params;
  const student = await getStudent(id);
  if (!student) notFound();
  const today = todayISO();
  const [lessons, repertoire, parents, music] = await Promise.all([
    listLessons(id, 5),
    listRepertoire(id),
    listParentsForStudent(id),
    listScoreIndex(id),
  ]);
  const latest = lessons[0] ?? null;
  const plan = lessons.find((l) => l.status === "approved") ?? null;
  const upcoming = nextLesson(student, latest, today);
  const position = bookPosition(student.instrument, student.current_book, repertoire);
  const working = repertoire.filter((r) => r.status === "learning" || r.status === "polishing" || r.status === "preview");
  const stale = staleReview(repertoire, today);

  return (
    <Shell
      title={
        <span className="flex items-center gap-3">
          <Avatar
            name={student.name}
            instrument={student.instrument}
            photoSrc={studentPhotoSrc(student)}
            size="lg"
            editStudentId={student.id}
          />
          <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            {student.name}
            <InstrumentTag instrument={student.instrument} />
          </span>
        </span>
      }
      eyebrow={student.current_book ?? undefined}
      back={{ href: `/teacher?student=${id}`, label: "Teacher desk" }}
      tab="desk"
      wide
      actions={
        <LinkButton href={`/students/${id}/edit`} variant="secondary" className="min-h-9 px-3 text-sm">
          Edit student
        </LinkButton>
      }
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-6">
          <section>
            <SectionTitle>About</SectionTitle>
            <Card className="flex flex-col divide-y divide-rule p-0 text-[15px]">
              <Info label="Instrument">
                {capitalize(student.instrument)}
                {student.age ? `, age ${student.age}` : ""}
                {student.method ? ` · ${humanize(student.method)}` : ""}
                {!student.active && (
                  <>
                    {" "}
                    <Pill>inactive</Pill>
                  </>
                )}
              </Info>
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
              <Info label="Goals">{student.goals || <span className="text-muted">None written yet</span>}</Info>
              <Info label="Private notes">{student.notes || <span className="text-muted">None</span>}</Info>
              {plan?.focus_points && <Info label="Last focus">{plan.focus_points}</Info>}
            </Card>
          </section>

          <section>
            <SectionTitle>More for {student.name}</SectionTitle>
            <div className="grid grid-cols-2 gap-2">
              <LinkButton href={`/students/${id}/music`} variant="secondary" className="text-sm">
                Music for the stand
              </LinkButton>
              <LinkButton href={`/students/${id}`} variant="secondary" className="text-sm">
                Full lesson history
              </LinkButton>
            </div>
          </section>

          <section>
            <SectionTitle>Pieces right now</SectionTitle>
            <Card className="flex flex-col gap-3">
              {position && (
                <div>
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="font-semibold">{position.book}</div>
                    <div className="text-sm tabular-nums text-muted">
                      {position.inReview} of {position.total} in review
                    </div>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-rule/60">
                    <div
                      className="h-full rounded-full bg-accent"
                      style={{
                        width: `${Math.round((position.inReview / Math.max(1, position.total)) * 100)}%`,
                      }}
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
                    Review pieces not played lately
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

        <section className="min-w-0">
          <SectionTitle>Repertoire map</SectionTitle>
          <p className="-mt-1 mb-2 text-sm text-muted">
            Every piece in {student.name}&apos;s books. Change a status here, or{" "}
            <Link href={`/students/${id}/lessons/new`} className="underline">
              record a lesson
            </Link>{" "}
            and it updates when you approve it.
          </p>
          <RepertoireMap
            studentId={id}
            instrument={student.instrument}
            repertoire={repertoire}
            scores={music}
            editable
          />
        </section>
      </div>
    </Shell>
  );
}
