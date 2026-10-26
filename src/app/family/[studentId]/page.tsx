import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Shell } from "@/components/shell";
import { WeekStrip } from "@/components/week-strip";
import { Button, Card, Field, Input, LinkButton, Notice, Pill, Row, SectionTitle, Textarea, cx } from "@/components/ui";
import { getViewer } from "@/lib/auth";
import { getCurrentPlan, getPracticeLog, getPracticeWeek, getStudent, getTeacherForStudent, listPracticeLogs } from "@/lib/data";
import { addDays, capitalize, formatDate, relativeDay, todayISO } from "@/lib/format";
import { savePractice } from "../actions";
import { listRecordingsForLesson } from "@/lib/recordings";
import { RecordingList } from "@/components/recording-player";

type Params = Promise<{ studentId: string }>;
type SP = Promise<{ date?: string; saved?: string; error?: string }>;

// The parent's page for one child: this week's plan from the approved
// lesson, and a one-tap practice log for a chosen day (today by default).
export default function FamilyStudentPage({ params, searchParams }: { params: Params; searchParams: SP }) {
  return (
    <Suspense fallback={<Shell title=" " tab="family">{null}</Shell>}>
      <Body params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Body({ params, searchParams }: { params: Params; searchParams: SP }) {
  const viewer = await getViewer();
  const { studentId } = await params;
  const sp = await searchParams;
  const student = await getStudent(studentId);
  if (!student) notFound();
  const today = todayISO();
  const date = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) && sp.date <= today ? sp.date : today;

  const [plan, week, log, history, teacher] = await Promise.all([
    getCurrentPlan(studentId),
    getPracticeWeek(studentId),
    getPracticeLog(studentId, date),
    listPracticeLogs(studentId, 30),
    getTeacherForStudent(student),
  ]);
  const recordings = plan ? (await listRecordingsForLesson(plan.id)).filter((r) => r.url) : [];
  const isTeacher = !!viewer.teacher && viewer.teacher.id === student.teacher_id;
  const firstName = student.name.split(" ")[0];
  const completed = new Set(log?.completed_assignment_ids ?? []);

  return (
    <Shell
      title={`${firstName}'s practice`}
      eyebrow={`${capitalize(student.instrument)}${student.current_book ? ` · ${student.current_book}` : ""}`}
      back={{ href: isTeacher ? `/students/${studentId}` : "/family", label: isTeacher ? student.name : "Home practice" }}
      tab="family"
      actions={
        plan ? (
          <LinkButton href={`/lessons/${plan.id}/sheet`} variant="secondary" className="min-h-9 px-3 text-sm">
            Print sheet
          </LinkButton>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-6">
        {sp.saved && <Notice tone="sage">Saved. Nice work.</Notice>}
        {sp.error && <Notice tone="danger">Couldn&apos;t save that. Try again.</Notice>}

        {!plan ? (
          <Card className="text-sm text-muted">
            No approved lesson yet. When {teacher?.name || "the teacher"} approves a lesson record, the practice plan appears here.
          </Card>
        ) : (
          <>
            <Card tone="plum" className="divide-y divide-plum/15">
              <div className="flex items-center justify-between pb-2">
                <div className="font-semibold">This week&apos;s plan</div>
                <span className="text-sm text-muted">lesson {formatDate(plan.lesson_date, "weekday")}</span>
              </div>
              {plan.focus_points && <Row label="Focus">{plan.focus_points}</Row>}
              {plan.summary && <Row label="In the lesson">{plan.summary}</Row>}
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

            {recordings.length > 0 && (
              <section>
                <SectionTitle>Lesson video</SectionTitle>
                <RecordingList recordings={recordings} />
              </section>
            )}

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
                            {a.kind === "listening" && <Pill tone="plum">listening</Pill>}
                            {a.kind === "review" && <Pill tone="sage">review</Pill>}
                            {a.kind === "game" && <Pill tone="amber">game</Pill>}
                          </span>
                          {a.how && <span className="block text-sm text-muted">{a.how}</span>}
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
                  <label className="flex items-end gap-3 pb-2.5 text-[15px]">
                    <input type="checkbox" name="listened" defaultChecked={log?.listened ?? false} className="h-6 w-6 accent-[var(--plum)]" />
                    Listened to the recording
                  </label>
                </div>
                <Field label="Note for the teacher" hint="What was hard, what went well, a question. Shows up in the teacher's brief.">
                  <Textarea name="parent_note" rows={2} defaultValue={log?.parent_note ?? ""} />
                </Field>
                <Button variant="plum" className="mt-1">
                  {log ? "Update" : "Save"} {date === today ? "today's" : "this day's"} practice
                </Button>
              </form>
            </section>
          </>
        )}

        <section>
          <SectionTitle>This week</SectionTitle>
          <Card>
            <WeekStrip week={week} large />
            <div className="mt-3 flex flex-wrap gap-1.5">
              <Pill tone={week.daysPracticed >= 5 ? "sage" : week.daysPracticed >= 3 ? "amber" : "muted"}>
                {week.daysPracticed} of 7 days
              </Pill>
              <Pill tone="plum">listened {week.daysListened} of 7</Pill>
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
                  className={cx("flex items-start gap-3 px-4 py-2.5", l.practice_date === date && "bg-accent-soft/60")}
                >
                  <div className="w-24 shrink-0 text-sm font-medium">{relativeDay(l.practice_date)}</div>
                  <div className="min-w-0 flex-1 text-sm">
                    <span>
                      {l.minutes ? `${l.minutes} min` : "practiced"}
                      {l.completed_assignment_ids.length > 0 ? ` · ${l.completed_assignment_ids.length} items` : ""}
                      {l.listened ? " · listened" : ""}
                    </span>
                    {l.parent_note && <div className="text-muted">“{l.parent_note}”</div>}
                  </div>
                </Link>
              ))}
            </Card>
          </section>
        )}
      </div>
    </Shell>
  );
}

function DayPicker({ studentId, date, today }: { studentId: string; date: string; today: string }) {
  const prev = addDays(date, -1);
  const next = addDays(date, 1);
  return (
    <div className="flex items-center gap-1 text-sm">
      <Link href={`/family/${studentId}?date=${prev}`} className="flex h-9 w-9 items-center justify-center rounded-lg text-accent-ink hover:bg-accent-soft" aria-label="Previous day">
        ‹
      </Link>
      {date !== today ? (
        <Link href={`/family/${studentId}`} className="font-medium text-accent-ink underline">
          today
        </Link>
      ) : (
        <span className="text-muted">log a past day</span>
      )}
      <Link
        href={next <= today ? `/family/${studentId}?date=${next}` : "#"}
        aria-disabled={next > today}
        className={cx("flex h-9 w-9 items-center justify-center rounded-lg", next > today ? "text-rule" : "text-accent-ink hover:bg-accent-soft")}
        aria-label="Next day"
      >
        ›
      </Link>
    </div>
  );
}
