import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Shell } from "@/components/shell";
import { Me } from "@/components/v3/me";
import { Avatar } from "@/components/avatar";
import { InstrumentTag } from "@/components/instrument-tag";
import { GradeLegend } from "@/components/grade-legend";
import { PracticeCalendarLegend, PracticeMonthCalendar } from "@/components/practice-month-calendar";
import { Timeline } from "@/components/v3/timeline";
import { Card, LinkButton, Pill } from "@/components/ui";
import { getViewer } from "@/lib/auth";
import { studentPhotoSrc } from "@/lib/constants";
import { getPracticeWeek, getStudent, practiceSpanLabel, practiceTone } from "@/lib/data";
import { addDays, capitalize, todayISO } from "@/lib/format";
import { listLessonMarks } from "@/lib/lesson-marks";
import { listPracticeDays } from "@/lib/practice/data";
import { monthOf, monthRange } from "@/lib/practice/month";
import { loadHistory } from "@/app/v3/students/[id]/history-data";

// Back to the "Who's practising?" picker. ?pick=1 keeps it from jumping
// straight back here when the studio has only one student.
const PICKER = { href: "/v3/family?pick=1", label: "Who's practising?" };
const RECENT_DAYS = 10;

type Params = Promise<{ studentId: string }>;

// Version 3 Family mode: the student's landing page, between "Who's
// practising?" and the practice page. For now it is the teacher's student
// page (calendar, last 10 days of history, See all history) with a big
// Start practice at the top, which opens the practice page with the
// repertoire lined up. Lessons still in draft are left out.
export default function V3FamilyStudent({ params }: { params: Params }) {
  return (
    <Suspense fallback={<Shell title=" " back={PICKER} v3Tab="family" me={<Me />} wide>{null}</Shell>}>
      <Body params={params} />
    </Suspense>
  );
}

async function Body({ params }: { params: Params }) {
  await getViewer();
  const { studentId: id } = await params;
  const student = await getStudent(id);
  if (!student) notFound();
  const today = todayISO();
  const monthSpan = monthRange(monthOf(today));
  const [{ lessons, entries: all }, week, practiceDays, lessonDays] = await Promise.all([
    loadHistory(id),
    getPracticeWeek(id),
    listPracticeDays(id, ...monthSpan),
    listLessonMarks(id, ...monthSpan, today),
  ]);
  const drafts = new Set(lessons.filter((l) => l.status === "draft").map((l) => `l-${l.id}`));
  const shown = all.filter((e) => !drafts.has(e.key));
  const since = addDays(today, -RECENT_DAYS);
  const entries = shown.filter((e) => e.date >= since);
  const older = shown.length - entries.length;

  return (
    <Shell
      title={
        <span className="flex items-center gap-3">
          <Avatar name={student.name} instrument={student.instrument} photoSrc={studentPhotoSrc(student)} size="lg" />
          <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            {student.name}
            <InstrumentTag instrument={student.instrument} />
          </span>
        </span>
      }
      eyebrow={student.current_book ?? undefined}
      back={PICKER}
      v3Tab="family"
      me={<Me />}
      wide
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap gap-1.5">
          <Pill tone={practiceTone(week)}>
            practised {week.daysPracticed} of {week.days.length} days {practiceSpanLabel(week)}
          </Pill>
        </div>

        <LinkButton href={`/v3/family/${id}/practice`} variant="plum" className="min-h-14 w-full text-[20px]">
          Start practice
        </LinkButton>

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
          <GradeLegend family />
        </Card>

        <Timeline
          entries={entries}
          headingNote={`last ${RECENT_DAYS} days`}
          footer={
            <LinkButton href={`/v3/students/${id}/history`} variant="secondary" className="min-h-12 w-full">
              See all history{older > 0 ? ` (${older} more)` : ""}
            </LinkButton>
          }
        />
      </div>
    </Shell>
  );
}
