import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Shell } from "@/components/shell";
import { WeekStrip } from "@/components/week-strip";
import {
  Button,
  Card,
  Field,
  Input,
  LinkButton,
  Notice,
  Pill,
  Row,
  SectionTitle,
  Textarea,
  cx,
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
  addDays,
  capitalize,
  formatDate,
  relativeDay,
  todayISO,
} from "@/lib/format";
import { savePractice } from "../actions";
import { isPlayable, listRecordingsForLesson } from "@/lib/recordings";
import { RecordingList } from "@/components/recording-player";
import { PracticeRecorder } from "@/components/practice-recorder";
import { PracticeSessionList } from "@/components/practice-session-list";
import { listPracticeDays, listPracticeSessions } from "@/lib/practice/data";
import { listPeriods } from "@/lib/practice/period";
import { PeriodReviewList } from "@/components/period-review-list";
import { JumpButton, VideoPopupProvider } from "@/components/video-popup";
import { listScores } from "@/lib/scores";
import { practiceJumps } from "@/lib/practice-jumps";
import { formatClock } from "@/lib/lesson-moments";

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
  const viewer = await getViewer();
  const { studentId } = await params;
  const sp = await searchParams;
  const student = await getStudent(studentId);
  if (!student) notFound();
  const today = todayISO();
  const date =
    sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) && sp.date <= today
      ? sp.date
      : today;

  const [plan, week, log, history, teacher, sessions, periods] =
    await Promise.all([
      getCurrentPlan(studentId),
      getPracticeWeek(studentId),
      getPracticeLog(studentId, date),
      listPracticeLogs(studentId, 30),
      getTeacherForStudent(student),
      listPracticeSessions(studentId, 10),
      listPeriods(studentId),
    ]);
  const practiceDays = week.days.length
    ? await listPracticeDays(studentId, week.days[0], week.days[week.days.length - 1])
    : {};
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
  const isTeacher =
    !!viewer.teacher && viewer.teacher.id === student.teacher_id;
  const firstName = student.name.split(" ")[0];
  const completed = new Set(log?.completed_assignment_ids ?? []);

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
          url: r.url,
          streamReady: r.streamReady,
          name: r.label || r.file_name,
        }))}
      >
        <div className="flex flex-col gap-6">
          {sp.saved && <Notice tone="sage">Saved. Nice work.</Notice>}
          {sp.error && (
            <Notice tone="danger">Couldn&apos;t save that. Try again.</Notice>
          )}

          <PracticeRecorder
            studentId={studentId}
            firstName={firstName}
            hasPlan={!!plan}
          />

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

              <section>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h2 className="text-lg font-semibold">
                    {date === today ? "Today" : formatDate(date, "weekday")}
                  </h2>
                  <DayPicker studentId={studentId} date={date} today={today} />
                </div>
                <form action={savePractice} className="flex flex-col gap-3">
                  <input type="hidden" name="student_id" value={studentId} />
                  <input type="hidden" name="practice_date" value={date} />
                  <ol className="flex flex-col gap-2">
                    {plan.assignments.map((a, i) => (
                      <li key={a.id}>
                        <label
                          className={cx(
                            "flex cursor-pointer items-start gap-3 rounded-2xl border bg-sheet p-3 has-[:checked]:border-sage has-[:checked]:bg-sage-soft",
                            "border-rule",
                          )}
                        >
                          <input
                            type="checkbox"
                            name="done"
                            value={a.id}
                            defaultChecked={completed.has(a.id)}
                            className="mt-1 h-6 w-6 shrink-0 accent-[var(--sage)]"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-center gap-x-2">
                              <span className="font-medium">
                                {i + 1}. {a.title}
                              </span>
                              {a.kind === "listening" && (
                                <Pill tone="plum">listening</Pill>
                              )}
                              {a.kind === "review" && (
                                <Pill tone="sage">review</Pill>
                              )}
                              {a.kind === "game" && (
                                <Pill tone="amber">game</Pill>
                              )}
                              {watch.jumps[a.id] && (
                                <JumpButton
                                  jump={watch.jumps[a.id]}
                                  className="ml-auto font-medium"
                                >
                                  ▶ Watch{" "}
                                  <span className="font-normal text-muted">
                                    {watch.jumps[a.id].earlier
                                      ? formatDate(
                                          watch.jumps[a.id].lessonDate,
                                          "short",
                                        )
                                      : formatClock(watch.jumps[a.id].seconds)}
                                  </span>
                                </JumpButton>
                              )}
                            </span>
                            {a.how && (
                              <span className="block text-sm text-muted">
                                {a.how}
                              </span>
                            )}
                          </span>
                        </label>
                      </li>
                    ))}
                  </ol>

                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Minutes">
                      <Input
                        name="minutes"
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={600}
                        defaultValue={log?.minutes ?? ""}
                        placeholder="20"
                      />
                    </Field>
                    <label className="flex items-end gap-3 pb-2.5 text-[16px]">
                      <input
                        type="checkbox"
                        name="listened"
                        defaultChecked={log?.listened ?? false}
                        className="h-6 w-6 accent-[var(--plum)]"
                      />
                      Listened to the recording
                    </label>
                  </div>
                  <Field
                    label="Note for the teacher"
                    hint="What was hard, what went well, a question. Shows up in the teacher's brief."
                  >
                    <Textarea
                      name="parent_note"
                      rows={2}
                      defaultValue={log?.parent_note ?? ""}
                    />
                  </Field>
                  <Button variant="plum" className="mt-1">
                    {log ? "Update" : "Save"}{" "}
                    {date === today ? "today's" : "this day's"} practice
                  </Button>
                </form>
              </section>

              {recordings.length > 0 && (
                <section>
                  <SectionTitle>Lesson video</SectionTitle>
                  <RecordingList recordings={recordings} />
                </section>
              )}
            </>
          )}

          {sessions.length > 0 && (
            <section>
              <SectionTitle>Practice reviews</SectionTitle>
              <PracticeSessionList
                sessions={sessions}
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

          <section>
            <SectionTitle>Practice record</SectionTitle>
            <Card>
              <div className="mb-2 text-sm font-medium text-muted">
                {capitalize(practiceSpanLabel(week))}
              </div>
              <WeekStrip week={week} large days={practiceDays} teacherView={isTeacher} />
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
            </Card>
          </section>

          {history.length > 0 && (
            <section>
              <SectionTitle>Practice log</SectionTitle>
              <Card className="divide-y divide-rule p-0">
                {history.map((l) => (
                  <Link
                    key={l.id}
                    href={`/family/${studentId}?date=${l.practice_date}`}
                    className={cx(
                      "flex items-start gap-3 px-4 py-2.5",
                      l.practice_date === date && "bg-accent-soft/60",
                    )}
                  >
                    <div className="w-24 shrink-0 text-sm font-medium">
                      {relativeDay(l.practice_date)}
                    </div>
                    <div className="min-w-0 flex-1 text-sm">
                      <span>
                        {l.minutes
                          ? `${l.minutes} min`
                          : l.completed_assignment_ids.length > 0
                            ? "practiced"
                            : "saved, nothing ticked"}
                        {l.completed_assignment_ids.length > 0
                          ? ` · ${l.completed_assignment_ids.length} items`
                          : ""}
                        {l.listened ? " · listened" : ""}
                      </span>
                      {l.parent_note && (
                        <div className="text-muted">“{l.parent_note}”</div>
                      )}
                    </div>
                  </Link>
                ))}
              </Card>
            </section>
          )}
        </div>
      </VideoPopupProvider>
    </Shell>
  );
}

function DayPicker({
  studentId,
  date,
  today,
}: {
  studentId: string;
  date: string;
  today: string;
}) {
  const prev = addDays(date, -1);
  const next = addDays(date, 1);
  return (
    <div className="flex items-center gap-1 text-sm">
      <Link
        href={`/family/${studentId}?date=${prev}`}
        className="flex h-9 w-9 items-center justify-center rounded-lg text-accent-ink hover:bg-accent-soft"
        aria-label="Previous day"
      >
        ‹
      </Link>
      {date !== today ? (
        <Link
          href={`/family/${studentId}`}
          className="font-medium text-accent-ink underline"
        >
          today
        </Link>
      ) : (
        <span className="text-muted">log a past day</span>
      )}
      <Link
        href={next <= today ? `/family/${studentId}?date=${next}` : "#"}
        aria-disabled={next > today}
        className={cx(
          "flex h-9 w-9 items-center justify-center rounded-lg",
          next > today ? "text-rule" : "text-accent-ink hover:bg-accent-soft",
        )}
        aria-label="Next day"
      >
        ›
      </Link>
    </div>
  );
}
