import { GradeLegend } from "@/components/grade-legend";
import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Shell } from "@/components/shell";
import { Me } from "@/components/v3/me";
import { Timeline } from "@/components/v3/timeline";
import { StartLessonMenu } from "@/components/v3/start-lesson-menu";
import { loadHistory } from "./history-data";
import { Avatar } from "@/components/avatar";
import { InstrumentTag } from "@/components/instrument-tag";
import { AddLesson } from "@/components/add-lesson";
import { Fold } from "@/components/fold";
import { PreLessonBrief } from "@/components/pre-lesson-brief";
import { RepertoireMap } from "@/components/repertoire-map";
import { PracticeCalendarLegend, PracticeMonthCalendar } from "@/components/practice-month-calendar";
import { listLessonMarks } from "@/lib/lesson-marks";
import { Button, Card, LinkButton, Notice, Pill } from "@/components/ui";
import { startLesson } from "@/app/lessons/live-actions";
import { openMusicStand } from "@/app/students/music-actions";
import { requireTeacher } from "@/lib/auth";
import { studentPhotoSrc } from "@/lib/constants";
import {
  getPracticeWeek,
  getStudent,
  listRepertoire,
  practiceSpanLabel,
  practiceTone,
} from "@/lib/data";
import { addDays, capitalize, todayISO } from "@/lib/format";
import { monthOf, monthRange } from "@/lib/practice/month";
import { viewerHref } from "@/lib/music-links";
import { listPracticeDays } from "@/lib/practice/data";
import { getConsentStatus } from "@/lib/recording-consent-data";
import { consentPath } from "@/lib/recording-consent";
import { listScoreIndex } from "@/lib/scores";

type Params = Promise<{ id: string }>;
type SP = Promise<{ show?: string; consent?: string }>;

// Version 3 student page, top to bottom: Start lesson (its ▾ drops down
// "Write up by hand") and Music stand; the full practice calendar; the last
// 10 days of history in one box of sections (Everything, Lessons, Practice,
// Videos, Reviews) picked from buttons on the left (across the top on a
// phone), with "See all history"; then the pre-lesson brief, music and bar
// maps, and a link to the student & family page (also the student's name).
const RECENT_DAYS = 10;

export default function V3StudentPage({ params, searchParams }: { params: Params; searchParams: SP }) {
  return (
    <Suspense fallback={<Shell title=" " v3Tab="students" me={<Me />} wide>{null}</Shell>}>
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
  const [{ lessons, entries: all }, week, repertoire, music, consent] = await Promise.all([
    loadHistory(id),
    getPracticeWeek(id),
    listRepertoire(id),
    listScoreIndex(id),
    getConsentStatus(id),
  ]);
  const today = todayISO();
  const monthSpan = monthRange(monthOf(today));
  const [practiceDays, lessonDays] = await Promise.all([
    listPracticeDays(id, ...monthSpan),
    listLessonMarks(id, ...monthSpan, today),
  ]);
  const first = student.name.split(" ")[0];
  const drafts = lessons.filter((l) => l.status === "draft");
  const since = addDays(today, -RECENT_DAYS);
  const entries = all.filter((e) => e.date >= since);
  const older = all.length - entries.length;

  const musicSection = (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-[20px] font-semibold">Music library</h2>
          <Link href={`/students/${id}/music`} className="text-sm text-accent-ink underline">
            Upload or manage
          </Link>
        </div>
        {music.length === 0 ? (
          <p className="text-sm text-muted">No music uploaded yet.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-rule">
            {music.map((m) => (
              <li key={m.id} className="flex flex-col gap-1 py-2.5">
                <span className="font-semibold">♪ {m.title}</span>
                <span className="text-sm text-muted">
                  {m.pageCount} page{m.pageCount === 1 ? "" : "s"}
                  {m.sections.length ? ` · ${m.sections.length} piece${m.sections.length === 1 ? "" : "s"} named` : ""}
                </span>
                <span className="flex flex-wrap gap-2">
                  {m.pageCount > 0 && (
                    <LinkButton href={viewerHref(id, m.id)} variant="secondary" className="min-h-9 px-3 text-sm">
                      Open
                    </LinkButton>
                  )}
                  {m.pageCount > 0 && (
                    <LinkButton href={`/students/${id}/music/${m.id}/bars`} variant="secondary" className="min-h-9 px-3 text-sm">
                      Bar map
                    </LinkButton>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <details className="group rounded-2xl border border-rule bg-sheet">
        <summary className="flex min-h-12 cursor-pointer list-none items-center px-4 font-display text-[18px] font-semibold [&::-webkit-details-marker]:hidden">
          Repertoire map
          <span aria-hidden className="ml-auto text-xl text-muted transition-transform group-open:rotate-90">
            ›
          </span>
        </summary>
        <div className="border-t border-rule p-3">
          <RepertoireMap studentId={id} instrument={student.instrument} repertoire={repertoire} scores={music} editable />
        </div>
      </details>
    </div>
  );

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
            <Link
              href={`/v3/students/${id}/about`}
              className="underline decoration-rule decoration-2 underline-offset-4 hover:decoration-accent"
              title={`${first}: details, progress and family`}
            >
              {student.name}
            </Link>
            <InstrumentTag instrument={student.instrument} />
          </span>
        </span>
      }
      eyebrow={student.current_book ?? undefined}
      back={{ href: "/v3/students", label: "Students" }}
      v3Tab="students"
      me={<Me />}
      wide
      actions={
        <Link href={`/students/${id}/edit`} className="text-sm font-medium text-accent-ink">
          Edit
        </Link>
      }
    >
      <div className="flex flex-col gap-5">
        {sp.consent === "signed" && consent.state === "signed" && (
          <Notice tone="sage">Recording consent signed. {first} can be recorded now.</Notice>
        )}
        <div className="flex flex-wrap gap-1.5">
          <Pill tone={practiceTone(week)}>
            practised {week.daysPracticed} of {week.days.length} days {practiceSpanLabel(week)}
          </Pill>
          {drafts.length > 0 && (
            <Pill tone="amber">
              {drafts.length} draft{drafts.length === 1 ? "" : "s"} to approve
            </Pill>
          )}
          {consent.state !== "signed" && <Pill tone="danger">consent needed</Pill>}
        </div>

        <div className="grid gap-2 sm:grid-cols-[2fr_1fr]">
          <StartLessonMenu
            items={[
              {
                href: `/students/${id}/lessons/new`,
                label: "Write up by hand",
                hint: "A lesson without a recording, or one from an earlier day",
              },
              {
                href: `/v3/family/${id}/practice`,
                label: "Start practice instead",
                hint: "Home practice, also when a parent is guiding it. Saved as a practice, never a lesson",
              },
            ]}
          >
            {consent.state === "signed" ? (
              <form action={startLesson}>
                <input type="hidden" name="student_id" value={id} />
                <Button className="min-h-12 w-full text-[17px]">Start lesson</Button>
              </form>
            ) : (
              <LinkButton href={consentPath(id, `/v3/students/${id}`)} className="min-h-12 w-full text-[17px]">
                Collect consent to start
              </LinkButton>
            )}
          </StartLessonMenu>
          <form action={openMusicStand}>
            <input type="hidden" name="student_id" value={id} />
            <Button variant="secondary" className="min-h-12 w-full">
              Music stand
            </Button>
          </form>
        </div>

        <Card className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-display text-[20px] font-semibold">Practice calendar</h2>
            <span className="text-sm text-muted">
              {capitalize(practiceSpanLabel(week))}: {week.daysPracticed} of {week.days.length} days, {week.totalMinutes} min
            </span>
          </div>
          <PracticeMonthCalendar
            studentId={id}
            today={today}
            initialDays={practiceDays}
            initialLessons={lessonDays}
            teacherView
            eventLinks
          />
          <PracticeCalendarLegend />
          <GradeLegend />
        </Card>

        <Timeline
          entries={entries}
          initial={sp.show}
          headingNote={`last ${RECENT_DAYS} days`}
          footer={
            <div className="flex flex-col gap-2">
              <LinkButton href={`/v3/students/${id}/history`} variant="secondary" className="min-h-12 w-full">
                See all history{older > 0 ? ` (${older} more)` : ""}
              </LinkButton>
              <AddLesson studentId={id} />
            </div>
          }
        />

        <Fold title="Pre-lesson brief" meta={`for the next lesson with ${first}`}>
          <PreLessonBrief student={student} lessons={lessons.slice(0, 6)} week={week} repertoire={repertoire} showRecordButton={false} />
        </Fold>
        <Fold title="Music &amp; bar maps" meta={`${music.length} uploaded`}>
          {musicSection}
        </Fold>
        <Link
          href={`/v3/students/${id}/about`}
          className="flex min-h-12 items-center gap-3 rounded-2xl border border-rule bg-sheet/60 px-4 py-2"
        >
          <span className="font-display text-[19px] font-semibold">Family &amp; student info</span>
          <span className="text-sm text-muted">
            consent, invites, progress
            {consent.state !== "signed" && <span className="text-danger"> · consent needed</span>}
          </span>
          <span aria-hidden className="ml-auto text-xl text-muted">
            ›
          </span>
        </Link>
      </div>
    </Shell>
  );
}

