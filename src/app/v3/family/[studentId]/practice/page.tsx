import { GradeLegend } from "@/components/grade-legend";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Shell } from "@/components/shell";
import { Me } from "@/components/v3/me";
import { WeekStrip } from "@/components/week-strip";
import { listLessonMarks } from "@/lib/lesson-marks";
import { PracticeRecorder } from "@/components/practice-recorder";
import { ConsentNeeded } from "@/components/consent-needed";
import { JumpButton, VideoPopupProvider } from "@/components/video-popup";
import { Button, Card, Notice, cx } from "@/components/ui";
import { savePractice } from "@/app/family/actions";
import { getViewer } from "@/lib/auth";
import { getCurrentPlan, getPracticeLog, getPracticeWeek, getStudent } from "@/lib/data";
import { formatDate, todayISO } from "@/lib/format";
import { formatClock } from "@/lib/lesson-moments";
import { practiceJumps } from "@/lib/practice-jumps";
import { getConsentStatus } from "@/lib/recording-consent-data";
import { listScores } from "@/lib/scores";
import { listPracticeDays } from "@/lib/practice/data";
import { listenTracksFor } from "@/lib/reference-data";
import { parsePlays } from "@/lib/reference-recordings";
import { ListenPlayer } from "@/components/listen-player";
import { ReminderList } from "@/components/reminder-editor";
import { listActiveReminders } from "@/lib/reminders";


type Params = Promise<{ studentId: string }>;
type SP = Promise<{ saved?: string; error?: string }>;

// Version 3 Family mode practice page, opened from Start practice on the
// student's landing page: only what a family needs at home, in big type.
// Start practice, today's practice card with a Watch clip for each item,
// and the week. No teacher tools. The basis for parent logins later.
export default function V3FamilyStudent({ params, searchParams }: { params: Params; searchParams: SP }) {
  return (
    <Suspense fallback={<Shell title=" " back={{ href: "/v3/family", label: "Back" }} v3Tab="family" me={<Me />} large>{null}</Shell>}>
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
  const [plan, week, log, consent, reminders] = await Promise.all([
    getCurrentPlan(studentId),
    getPracticeWeek(studentId),
    getPracticeLog(studentId, today),
    getConsentStatus(studentId),
    listActiveReminders(studentId),
  ]);
  const scores = plan ? await listScores(studentId, { includeArchived: true }) : [];
  const watch = plan ? await practiceJumps(plan, scores) : { jumps: {}, recordings: [] };
  const first = student.name.split(" ")[0];
  const done = new Set(log?.completed_assignment_ids ?? []);
  const listenTracks = plan ? await listenTracksFor(plan.assignments.map((a) => a.reference_recording_id)) : {};
  const plays = parsePlays(log?.listen_plays);
  const isTeacher = !!viewer.teacher && viewer.teacher.id === student.teacher_id;
  const [practiceDays, lessonDays] = week.days.length
    ? await Promise.all([
        listPracticeDays(studentId, week.days[0], week.days[week.days.length - 1]),
        listLessonMarks(studentId, week.days[0], week.days[week.days.length - 1]),
      ])
    : [{}, {}];

  return (
    <Shell title={`${first}'s practice`} back={{ href: `/v3/family/${studentId}`, label: first }} eyebrow={formatDate(today, "long")} v3Tab="family" me={<Me />} large>
      <VideoPopupProvider
        fullQuality={false}
        studentId={studentId}
        scores={scores.map((s) => ({
          id: s.id,
          title: s.title,
          pages: s.pages.map((p) => ({ url: p.url, w: p.w, h: p.h })),
          sections: s.sections,
        }))}
        recordings={watch.recordings.map((r) => ({
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
          {sp.saved && <Notice tone="sage">Saved. Nice work!</Notice>}
          {sp.error && <Notice tone="danger">Couldn&apos;t save that. Try again.</Notice>}

          {consent.state === "signed" ? (
            <div className="[&_button]:min-h-14 [&_button]:text-[19px]">
              <PracticeRecorder studentId={studentId} hasPlan={!!plan} instrument={student.instrument} />
            </div>
          ) : (
            <ConsentNeeded
              studentId={studentId}
              studentName={student.name}
              state={consent.state}
              next={`/v3/family/${studentId}/practice`}
              what="recording practice"
              canCollect={isTeacher}
            />
          )}

          {!plan ? (
            <Card className="text-[19px]">No practice plan yet. It appears here once the teacher approves a lesson.</Card>
          ) : (
            <section className="flex flex-col gap-3">
              <h2 className="font-display text-[26px] font-semibold">Today&apos;s practice</h2>
              {plan.focus_points && (
                <Card tone="plum" className="text-[19px] leading-relaxed">
                  <span className="font-semibold">Focus: </span>
                  {plan.focus_points}
                </Card>
              )}
              {reminders.length > 0 && (
                <Card className="flex flex-col gap-2">
                  <div className="text-[15px] font-semibold uppercase tracking-[0.1em] text-accent-ink">
                    Remember every time
                  </div>
                  <ReminderList reminders={reminders} large />
                </Card>
              )}
              {plan.parent_message && <p className="px-1 text-[18px] italic text-muted">“{plan.parent_message}”</p>}
              <form action={savePractice} className="flex flex-col gap-3">
                <input type="hidden" name="student_id" value={studentId} />
                <input type="hidden" name="return_to" value={`/v3/family/${studentId}/practice`} />
                <input type="hidden" name="practice_date" value={today} />
                <input type="hidden" name="minutes" value={log?.minutes ?? ""} />
                {log?.listened && <input type="hidden" name="listened" value="on" />}
                <input type="hidden" name="parent_note" value={log?.parent_note ?? ""} />
                <ol className="flex flex-col gap-3">
                  {plan.assignments.map((a, i) => {
                    const j = watch.jumps[a.id];
                    const track = a.reference_recording_id ? listenTracks[a.reference_recording_id] : undefined;
                    return (
                      <li key={a.id}>
                        <label
                          className={cx(
                            "flex cursor-pointer items-start gap-4 rounded-2xl border border-rule bg-sheet p-4",
                            "has-[:checked]:border-sage has-[:checked]:bg-sage-soft",
                          )}
                        >
                          <input
                            key={`${a.id}-${done.has(a.id)}`}
                            type="checkbox"
                            name="done"
                            value={a.id}
                            defaultChecked={done.has(a.id)}
                            className="mt-1 h-8 w-8 shrink-0 accent-[var(--sage)]"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block text-[21px] font-semibold leading-snug">
                              {i + 1}. {a.title}
                            </span>
                            {a.how && <span className="mt-0.5 block text-[18px] text-muted">{a.how}</span>}
                            {j && (
                              <JumpButton jump={j} className="mt-2 min-h-12 rounded-xl px-4 text-[18px]">
                                ▶ Watch{" "}
                                <span className="font-normal text-muted">
                                  {j.earlier ? formatDate(j.lessonDate, "short") : formatClock(j.seconds)}
                                </span>
                              </JumpButton>
                            )}
                          </span>
                        </label>
                        {track && (
                          <div className="mt-2 px-1">
                            <ListenPlayer
                              key={`${a.id}-${today}`}
                              track={track}
                              assignmentId={a.id}
                              studentId={studentId}
                              date={today}
                              times={Math.max(1, a.listen_times ?? 1)}
                              initialPlays={plays[a.id] ?? 0}
                            />
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ol>
                <Button variant="plum" className="min-h-14 text-[20px]">
                  {log ? "Update today's ticks" : "Save today's ticks"}
                </Button>
              </form>
            </section>
          )}

          <section className="flex flex-col gap-2">
            <h2 className="font-display text-[22px] font-semibold">Since the last lesson</h2>
            <Card>
              <WeekStrip week={week} large days={practiceDays} lessons={lessonDays} />
              <p className="mt-3 text-[18px]">
                {week.daysPracticed} of {week.days.length} days practised
                {week.totalMinutes > 0 ? ` · ${week.totalMinutes} min` : ""}
              </p>
              <GradeLegend family className="mt-2" />
            </Card>
          </section>
        </div>
      </VideoPopupProvider>
    </Shell>
  );
}
