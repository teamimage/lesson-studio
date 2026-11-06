import { GradeLegend } from "@/components/grade-legend";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Shell } from "@/components/shell";
import { WeekStrip } from "@/components/week-strip";
import { listLessonMarks } from "@/lib/lesson-marks";
import {
  Card,
  LinkButton,
  Notice,
  Pill,
  Row,
  SectionTitle,
} from "@/components/ui";
import { getViewer } from "@/lib/auth";
import {
  getCurrentPlan,
  getPracticeLog,
  getPracticeWeek,
  getStudent,
  getTeacherForStudent,
  listPracticeLogs,
  practiceSpanLabel,
  practiceTone,
} from "@/lib/data";
import {
  capitalize,
  formatDate,
  todayISO,
} from "@/lib/format";
import { isPlayable, listRecordingsForLesson } from "@/lib/recordings";
import { RecordingList } from "@/components/recording-player";
import { PracticeRecorder } from "@/components/practice-recorder";
import { ConsentNeeded } from "@/components/consent-needed";
import { getConsentStatus } from "@/lib/recording-consent-data";
import { PracticeSessionList } from "@/components/practice-session-list";
import { listPracticeDays, listPracticeSessions } from "@/lib/practice/data";
import { listPeriods } from "@/lib/practice/period";
import { PeriodReviewList } from "@/components/period-review-list";
import { VideoPopupProvider } from "@/components/video-popup";
import { listScores } from "@/lib/scores";
import { practiceJumps } from "@/lib/practice-jumps";
import { formatClock } from "@/lib/lesson-moments";
import { listenTracksFor } from "@/lib/reference-data";
import { ReminderList } from "@/components/reminder-editor";
import { listActiveReminders } from "@/lib/reminders";
import { getUiVersion } from "@/lib/ui-version-server";
import { getPracticeView } from "@/lib/practice-view-server";
import { PracticeViewToggle } from "@/components/practice-view-toggle";
import { DayPractice, type DayItem, type DayLog } from "@/components/day-practice";

type Params = Promise<{ studentId: string }>;
type SP = Promise<{ date?: string; saved?: string; error?: string }>;

// The parent's page for one child: the practice plan from the approved
// lesson, and a one-tap practice log for a chosen day (today by default).
export default function FamilyStudentPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SP;
}) {
  return (
    <Suspense
      fallback={
        <Shell title=" " tab="family">
          {null}
        </Shell>
      }
    >
      <Body params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Body({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SP;
}) {
  const [viewer, ui, view] = await Promise.all([getViewer(), getUiVersion(), getPracticeView()]);
  const { studentId } = await params;
  const sp = await searchParams;
  const student = await getStudent(studentId);
  if (!student) notFound();
  const today = todayISO();
  const date =
    sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) && sp.date <= today
      ? sp.date
      : today;

  const [plan, week, log, history, teacher, sessions, periods, consent, reminders] =
    await Promise.all([
      getCurrentPlan(studentId),
      getPracticeWeek(studentId),
      getPracticeLog(studentId, date),
      listPracticeLogs(studentId, 30),
      getTeacherForStudent(student),
      listPracticeSessions(studentId, 20),
      listPeriods(studentId),
      getConsentStatus(studentId),
      listActiveReminders(studentId),
    ]);
  const [practiceDays, lessonDays] = week.days.length
    ? await Promise.all([
        listPracticeDays(studentId, week.days[0], week.days[week.days.length - 1]),
        listLessonMarks(studentId, week.days[0], week.days[week.days.length - 1]),
      ])
    : [{}, {}];
  // Families watch the fast streaming copy; the original is only offered
  // while that copy is still being made.
  const [recordings, scores] = plan
    ? await Promise.all([
        listRecordingsForLesson(plan.id, "until-stream").then((r) =>
          r.filter(isPlayable),
        ),
        listScores(studentId, { includeArchived: true }),
      ])
    : [[], []];
  // Each practice item's spot in the lesson video it was last worked on.
  const watch = plan
    ? await practiceJumps(plan, scores)
    : { jumps: {}, recordings: [] };
  const popupRecordings = [
    ...new Map(
      [...recordings, ...watch.recordings].map((r) => [r.id, r]),
    ).values(),
  ];
  // Recordings the plan assigns for listening, ready to play.
  const listenTracks = plan
    ? await listenTracksFor(plan.assignments.map((a) => a.reference_recording_id))
    : {};
  const ownTeacher =
    !!viewer.teacher && viewer.teacher.id === student.teacher_id;
  // Proposed version: the teacher can switch to Family and see the page
  // exactly as the parent does (no teacher notes, family grade wording).
  const toggle = ui === "proposed" && ownTeacher;
  const isTeacher = ownTeacher && !(toggle && view === "family");
  const firstName = student.name.split(" ")[0];
  // The last 30 logs cover every day back to the oldest of them, so the day
  // arrows switch instantly inside that stretch.
  const dayLogs: DayLog[] = [...history, ...(log && !history.some((h) => h.id === log.id) ? [log] : [])];
  const knownFrom =
    history.length < 30 ? "0000-01-01" : history[history.length - 1].practice_date;
  const dayItems: DayItem[] = (plan?.assignments ?? []).map((a) => {
    const jump = watch.jumps[a.id];
    return {
      id: a.id,
      title: a.title,
      kind: a.kind,
      how: a.how,
      jump,
      jumpLabel: jump
        ? jump.earlier
          ? formatDate(jump.lessonDate, "short")
          : formatClock(jump.seconds)
        : undefined,
      track: a.reference_recording_id ? listenTracks[a.reference_recording_id] : undefined,
      listenTimes: Math.max(1, a.listen_times ?? 1),
    };
  });

  // Every session since the last lesson, stacked; without a lesson, the last 10.
  const recentSessions = plan
    ? sessions.filter((x) => x.practice_date >= plan.lesson_date)
    : sessions.slice(0, 10);

  return (
    <Shell
      title={`${firstName}'s practice`}
      eyebrow={`${capitalize(student.instrument)}${student.current_book ? ` · ${student.current_book}` : ""}`}
      back={{
        href: isTeacher ? `/students/${studentId}` : "/family",
        label: isTeacher ? student.name : "Home practice",
      }}
      tab="family"
      actions={
        plan ? (
          <LinkButton
            href={`/lessons/${plan.id}/sheet`}
            variant="secondary"
            className="min-h-9 px-3 text-sm"
          >
            Print sheet
          </LinkButton>
        ) : undefined
      }
    >
      <VideoPopupProvider
        fullQuality={false}
        studentId={studentId}
        scores={scores.map((s) => ({
          id: s.id,
          title: s.title,
          pages: s.pages.map((p) => ({ url: p.url, w: p.w, h: p.h })),
          sections: s.sections,
        }))}
        recordings={popupRecordings.map((r) => ({
          id: r.id,
          lessonId: r.lesson_id,
          url: r.url,
          streamReady: r.streamReady,
          name: r.label || r.file_name,
          startedAt: r.started_at,
          isMain: r.isMain,
        }))}
      >
        <div className="flex flex-col gap-6">
          {toggle && <PracticeViewToggle view={view} />}
          {sp.saved && <Notice tone="sage">Saved. Nice work.</Notice>}
          {sp.error && (
            <Notice tone="danger">Couldn&apos;t save that. Try again.</Notice>
          )}

          {consent.state === "signed" ? (
            <PracticeRecorder
              studentId={studentId}
              hasPlan={!!plan}
              instrument={student.instrument}
            />
          ) : (
            <ConsentNeeded
              studentId={studentId}
              studentName={student.name}
              state={consent.state}
              next={`/family/${studentId}`}
              what="recording practice"
              canCollect={isTeacher}
            />
          )}

          {plan && (
            <DayPractice
              key={`${date}-${sp.saved ?? ""}`}
              studentId={studentId}
              today={today}
              initialDate={date}
              logs={dayLogs}
              knownFrom={knownFrom}
              items={dayItems}
            />
          )}

          {!plan && reminders.length > 0 && (
            <Card tone="plum" className="flex flex-col gap-2">
              <div className="text-[12px] font-semibold uppercase tracking-[0.1em] text-accent-ink">
                Remember every time
              </div>
              <ReminderList reminders={reminders} />
            </Card>
          )}
          {!plan ? (
            <Card className="text-sm text-muted">
              No approved lesson yet. When {teacher?.name || "the teacher"}{" "}
              approves a lesson record, the practice plan appears here.
            </Card>
          ) : (
            <>
              <Card tone="plum" className="divide-y divide-plum/15">
                <div className="flex items-center justify-between pb-2">
                  <div className="font-semibold">Practice plan</div>
                  <span className="text-sm text-muted">
                    lesson {formatDate(plan.lesson_date, "weekday")}
                  </span>
                </div>
                {plan.focus_points && (
                  <Row label="Focus">{plan.focus_points}</Row>
                )}
                {reminders.length > 0 && (
                  <Row label="Remember every time">
                    <ReminderList reminders={reminders} />
                  </Row>
                )}
                {plan.summary && (
                  <Row label="In the lesson">{plan.summary}</Row>
                )}
                {plan.parent_message && (
                  <Row label="Teacher says">
                    <span className="italic">“{plan.parent_message}”</span>
                  </Row>
                )}
                {plan.next_lesson_date && (
                  <Row label="Next lesson">
                    {formatDate(plan.next_lesson_date, "weekday")}
                    {student.lesson_time ? `, ${student.lesson_time}` : ""}
                  </Row>
                )}
              </Card>
            </>
          )}

          <section>
            <SectionTitle>Practice record</SectionTitle>
            <Card>
              <div className="mb-2 text-sm font-medium text-muted">
                {capitalize(practiceSpanLabel(week))}
              </div>
              <WeekStrip week={week} large days={practiceDays} lessons={lessonDays} teacherView={isTeacher} />
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Pill
                  tone={
                    practiceTone(week) === "danger"
                      ? "muted"
                      : practiceTone(week)
                  }
                >
                  {week.daysPracticed} of {week.days.length} days
                </Pill>
                <Pill tone="plum">
                  listened {week.daysListened} of {week.days.length}
                </Pill>
                {week.totalMinutes > 0 && <Pill>{week.totalMinutes} min</Pill>}
              </div>
              <GradeLegend family={!isTeacher} className="mt-2" />
            </Card>
          </section>

          {recentSessions.length > 0 && (
            <section>
              <SectionTitle>Practice reviews</SectionTitle>
              <PracticeSessionList
                sessions={recentSessions}
                teacherView={isTeacher}
              />
            </section>
          )}

          <section>
            <SectionTitle>Weekly practice reviews</SectionTitle>
            <PeriodReviewList
              studentId={studentId}
              periods={periods}
              writeMissing
            />
          </section>

          {plan && recordings.length > 0 && (
            <section>
              <SectionTitle>Lesson video</SectionTitle>
              <RecordingList recordings={recordings} />
            </section>
          )}
        </div>
      </VideoPopupProvider>
    </Shell>
  );
}
