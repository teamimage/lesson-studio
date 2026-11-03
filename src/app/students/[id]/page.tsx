import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/avatar";
import { InstrumentTag } from "@/components/instrument-tag";
import { studentPhotoSrc } from "@/lib/constants";
import { Shell } from "@/components/shell";
import { Button, Card, EmptyState, LinkButton, Notice, Pill, SectionTitle } from "@/components/ui";
import { requireTeacher } from "@/lib/auth";
import { getPracticeWeek, getStudent, practiceSpanLabel, listLessons, listParentsForStudent, listRepertoire } from "@/lib/data";
import { formatDate } from "@/lib/format";
import { TodayDate } from "@/components/today-date";
import { WeekStrip } from "@/components/week-strip";
import { RepertoireMap } from "@/components/repertoire-map";
import { AddLesson } from "@/components/add-lesson";
import { openMusicStand } from "@/app/students/music-actions";
import { startLesson } from "@/app/lessons/live-actions";
import { listScoreIndex } from "@/lib/scores";
import { MusicPreviewLinks } from "@/components/music-preview-links";
import { PracticeSessionList } from "@/components/practice-session-list";
import { listPracticeDays, listPracticeSessions } from "@/lib/practice/data";
import { listPeriods } from "@/lib/practice/period";
import { PeriodReviewList } from "@/components/period-review-list";
import { ConsentNeeded } from "@/components/consent-needed";
import { LocalDateTime } from "@/components/local-time";
import { getConsentStatus } from "@/lib/recording-consent-data";
import { consentPath } from "@/lib/recording-consent";

type Params = Promise<{ id: string }>;
type SP = Promise<{ consent?: string }>;

export default function StudentPage({ params, searchParams }: { params: Params; searchParams: SP }) {
  return (
    <Suspense fallback={<Shell title=" " tab="studio">{null}</Shell>}>
      <Body params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Body({ params, searchParams }: { params: Params; searchParams: SP }) {
  await requireTeacher();
  const { id } = await params;
  const sp = await searchParams;
  const student = await getStudent(id);
  if (!student) notFound();
  const [lessons, week, repertoire, parents, music, sessions, periods, consent] = await Promise.all([
    listLessons(id),
    getPracticeWeek(id),
    listRepertoire(id),
    listParentsForStudent(id),
    listScoreIndex(id),
    listPracticeSessions(id, 5),
    listPeriods(id),
    getConsentStatus(id),
  ]);
  const practiceDays = week.days.length ? await listPracticeDays(id, week.days[0], week.days[week.days.length - 1]) : {};

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
      back={{ href: "/", label: "Studio" }}
      tab="studio"
      actions={
        <>
          <TodayDate className="text-sm text-muted" />
          <Link href={`/students/${id}/edit`} className="ml-2 text-sm font-medium text-accent-ink">
            Edit
          </Link>
        </>
      }
    >
      <div className="flex flex-col gap-6">
        {sp.consent === "signed" && consent.state === "signed" && (
          <Notice tone="sage">Recording consent signed. {student.name.split(" ")[0]} can be recorded now.</Notice>
        )}
        <div className="grid grid-cols-2 gap-2">
          {consent.state === "signed" ? (
            <form action={startLesson} className="col-span-2">
              <input type="hidden" name="student_id" value={id} />
              <Button className="min-h-14 w-full text-lg">Start lesson</Button>
            </form>
          ) : (
            <div className="col-span-2">
              <ConsentNeeded
                studentId={id}
                studentName={student.name}
                state={consent.state}
                next={`/students/${id}`}
                what="starting a recorded lesson"
              />
            </div>
          )}
          <LinkButton href={`/students/${id}/brief`} variant="secondary">
            Pre-lesson brief
          </LinkButton>
          <LinkButton href={`/students/${id}/lessons/new`}>Record lesson</LinkButton>
          <form action={openMusicStand}>
            <input type="hidden" name="student_id" value={id} />
            <Button variant="secondary" className="w-full">
              Music stand
            </Button>
          </form>
          <LinkButton href={`/students/${id}/music`} variant="secondary">
            Music
          </LinkButton>
          <MusicPreviewLinks studentId={id} scores={music} className="col-span-2 px-1" />
          <div className="col-span-2">
            <AddLesson studentId={id} />
          </div>
        </div>

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
          <SectionTitle
            action={
              <span className="text-sm text-muted">
                {week.daysPracticed} of {week.days.length} days · {week.totalMinutes} min
              </span>
            }
          >
            Practice record
          </SectionTitle>
          <Card>
            <div className="mb-2 text-sm font-medium text-muted">
              {practiceSpanLabel(week).replace(/^./, (c) => c.toUpperCase())}
            </div>
            <WeekStrip week={week} days={practiceDays} teacherView />
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
        </section>

        {sessions.length > 0 && (
          <section>
            <SectionTitle>Practice reviews</SectionTitle>
            <PracticeSessionList sessions={sessions} teacherView compact />
          </section>
        )}

        <section>
          <SectionTitle>Weekly practice reviews</SectionTitle>
          <PeriodReviewList studentId={id} periods={periods} writeMissing />
        </section>

        {(student.goals || student.notes || student.lesson_day) && (
          <Card className="flex flex-col gap-2 text-[16px]">
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
          <SectionTitle>Repertoire map</SectionTitle>
          <RepertoireMap
            studentId={id}
            instrument={student.instrument}
            repertoire={repertoire}
            scores={music}
            editable
          />
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
          <p className="mb-2 text-sm">
            {consent.state === "signed" ? (
              <>
                ✓ Recording consent signed by {consent.consent.signerName} on{" "}
                <LocalDateTime iso={consent.consent.signedAt} />.{" "}
              </>
            ) : (
              <span className="text-danger">No recording consent on file. </span>
            )}
            <Link href={consentPath(id)} className="text-accent-ink underline">
              {consent.state === "signed" ? "View or withdraw" : "Collect consent"}
            </Link>
          </p>
          {parents.length === 0 ? (
            <p className="text-sm text-muted">No parent linked yet. Add one so they can see the home plan.</p>
          ) : (
            <ul className="text-[16px]">
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
