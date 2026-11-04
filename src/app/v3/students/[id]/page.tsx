import { GradeLegend } from "@/components/grade-legend";
import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Shell } from "@/components/shell";
import { Me } from "@/components/v3/me";
import { Entry, Timeline, type TimelineEntry } from "@/components/v3/timeline";
import { Avatar } from "@/components/avatar";
import { InstrumentTag } from "@/components/instrument-tag";
import { AddLesson } from "@/components/add-lesson";
import { AssignmentList } from "@/components/assignment-list";
import { Fold } from "@/components/fold";
import { PreLessonBrief } from "@/components/pre-lesson-brief";
import { PracticeSessionList } from "@/components/practice-session-list";
import { PeriodReviewWriter } from "@/components/period-review-writer";
import { RepertoireMap } from "@/components/repertoire-map";
import { WeekStrip } from "@/components/week-strip";
import { listLessonMarks } from "@/lib/lesson-marks";
import { LocalDateTime } from "@/components/local-time";
import { Button, Card, LinkButton, Notice, Pill } from "@/components/ui";
import { startLesson } from "@/app/lessons/live-actions";
import { openMusicStand } from "@/app/students/music-actions";
import { requireTeacher } from "@/lib/auth";
import { studentPhotoSrc } from "@/lib/constants";
import {
  getPracticeWeek,
  getStudent,
  listLessons,
  listParentsForStudent,
  listPracticeLogs,
  listRepertoire,
  practiceSpanLabel,
  practiceTone,
} from "@/lib/data";
import { capitalize, formatDate, formatDuration, humanize, relativeDay } from "@/lib/format";
import { viewerHref } from "@/lib/music-links";
import { listPracticeDays, listPracticeSessions, type PracticeSessionView } from "@/lib/practice/data";
import { listPeriods, periodLabel } from "@/lib/practice/period";
import { getConsentStatus } from "@/lib/recording-consent-data";
import { consentPath } from "@/lib/recording-consent";
import { listRecordingsForStudent } from "@/lib/recordings";
import { listScoreIndex } from "@/lib/scores";

type Params = Promise<{ id: string }>;
type SP = Promise<{ show?: string; consent?: string }>;

// Version 3 student page: one timeline (lessons, practice, videos, reviews)
// with filters, each entry opening in place. Music and bar maps live in a
// side panel (on a phone, a fold above the timeline).
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
  const [lessons, week, repertoire, parents, music, sessions, logs, periods, consent, recordings] = await Promise.all([
    listLessons(id, 50),
    getPracticeWeek(id),
    listRepertoire(id),
    listParentsForStudent(id),
    listScoreIndex(id),
    listPracticeSessions(id, 40),
    listPracticeLogs(id, 90),
    listPeriods(id, 12),
    getConsentStatus(id),
    listRecordingsForStudent(id, 100),
  ]);
  const [practiceDays, lessonDays] = week.days.length
    ? await Promise.all([
        listPracticeDays(id, week.days[0], week.days[week.days.length - 1]),
        listLessonMarks(id, week.days[0], week.days[week.days.length - 1]),
      ])
    : [{}, {}];
  const first = student.name.split(" ")[0];
  const drafts = lessons.filter((l) => l.status === "draft");
  const entries = buildEntries({ studentId: id, lessons, sessions, logs, periods, recordings });

  const sidePanel = (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-[20px] font-semibold">Music</h2>
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
      <Card className="flex flex-col gap-2 text-[16px]">
        <h2 className="font-display text-[18px] font-semibold">Family</h2>
        <p className="text-sm">
          {consent.state === "signed" ? (
            <>
              ✓ Consent signed by {consent.consent.signerName}, <LocalDateTime iso={consent.consent.signedAt} />.{" "}
            </>
          ) : (
            <span className="text-danger">No recording consent on file. </span>
          )}
          <Link href={consentPath(id, `/v3/students/${id}`)} className="text-accent-ink underline">
            {consent.state === "signed" ? "View or withdraw" : "Collect consent"}
          </Link>
        </p>
        {parents.length === 0 ? (
          <p className="text-sm text-muted">No parent linked yet.</p>
        ) : (
          <ul className="text-sm">
            {parents.map((p) => (
              <li key={p.id}>
                {p.name} <span className="text-muted">· {p.email}</span>
              </li>
            ))}
          </ul>
        )}
        {student.lesson_day && (
          <div className="text-sm">
            <span className="text-muted">Lessons: </span>
            {student.lesson_day}
            {student.lesson_time ? ` at ${student.lesson_time}` : ""}
          </div>
        )}
        {student.goals && (
          <div className="text-sm">
            <span className="text-muted">Goals: </span>
            {student.goals}
          </div>
        )}
        {student.notes && (
          <div className="text-sm">
            <span className="text-muted">Private notes: </span>
            {student.notes}
          </div>
        )}
        <Link href={`/v3/family/${id}`} className="text-sm text-plum underline">
          See {first}&apos;s Family mode
        </Link>
      </Card>
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
            {student.name}
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

        <div className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr]">
          {consent.state === "signed" ? (
            <form action={startLesson}>
              <input type="hidden" name="student_id" value={id} />
              <Button className="min-h-12 w-full text-[17px]">Start lesson</Button>
            </form>
          ) : (
            <LinkButton href={consentPath(id, `/v3/students/${id}`)} className="min-h-12 text-[17px]">
              Collect consent to start
            </LinkButton>
          )}
          <form action={openMusicStand}>
            <input type="hidden" name="student_id" value={id} />
            <Button variant="secondary" className="min-h-12 w-full">
              Music stand
            </Button>
          </form>
          <LinkButton href={`/students/${id}/lessons/new`} variant="secondary" className="min-h-12">
            Write up by hand
          </LinkButton>
        </div>

        <Fold title="Pre-lesson brief" meta={`for the next lesson with ${first}`}>
          <PreLessonBrief student={student} lessons={lessons.slice(0, 6)} week={week} repertoire={repertoire} showRecordButton={false} />
        </Fold>


        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="flex min-w-0 flex-col gap-4">
            {/* Phones and iPad portrait: the side panel folds above the timeline. */}
            <div className="lg:hidden">
              <Fold title="Music, bar maps &amp; family" meta={`${music.length} uploaded`}>
                {sidePanel}
              </Fold>
            </div>
            <Card className="flex flex-col gap-2">
              <div className="text-sm font-medium text-muted">{capitalize(practiceSpanLabel(week))}</div>
              <WeekStrip week={week} days={practiceDays} lessons={lessonDays} teacherView />
              <GradeLegend />
            </Card>
            <Timeline entries={entries} initial={sp.show} />
            <AddLesson studentId={id} />
          </div>
          <aside className="sticky top-28 hidden max-h-[calc(100dvh-8rem)] overflow-y-auto lg:block" aria-label="Music and family">
            {sidePanel}
          </aside>
        </div>
      </div>
    </Shell>
  );
}

type Recording = Awaited<ReturnType<typeof listRecordingsForStudent>>[number];
type Logs = Awaited<ReturnType<typeof listPracticeLogs>>;
type Periods = Awaited<ReturnType<typeof listPeriods>>;
type Lessons = Awaited<ReturnType<typeof listLessons>>;

// Every dated thing about the student, newest first. Sort key is the day plus
// a rank, so on one day a lesson sits above the practice and the video.
function buildEntries({
  studentId,
  lessons,
  sessions,
  logs,
  periods,
  recordings,
}: {
  studentId: string;
  lessons: Lessons;
  sessions: PracticeSessionView[];
  logs: Logs;
  periods: Periods;
  recordings: Recording[];
}): TimelineEntry[] {
  const out: (TimelineEntry & { sort: string })[] = [];
  const lessonDate = new Map(lessons.map((l) => [l.id, l.lesson_date]));
  const dayLabel = (d: string) => `${capitalize(relativeDay(d))} · ${formatDate(d, "weekday")}`;
  const latestLesson = lessons[0]?.id;

  for (const l of lessons) {
    const videos = recordings.filter((r) => r.lesson_id === l.id).length;
    out.push({
      key: `l-${l.id}`,
      kind: "lesson",
      day: dayLabel(l.lesson_date),
      sort: `${l.lesson_date}-3`,
      node: (
        <Entry
          title={`Lesson${l.lesson_pieces.length ? `: ${l.lesson_pieces.map((p) => p.title).join(", ")}` : ""}`}
          meta={l.summary || (l.status === "draft" ? "Draft, not written up yet" : undefined)}
          badge={<Pill tone={l.status === "draft" ? "amber" : "sage"}>{l.status === "draft" ? "Draft" : "Approved"}</Pill>}
          tone={l.status === "draft" ? "amber" : "sheet"}
          open={l.id === latestLesson}
        >
          {l.summary && <p>{l.summary}</p>}
          {l.focus_points && (
            <p>
              <span className="font-semibold">Focus: </span>
              {l.focus_points}
            </p>
          )}
          {l.lesson_pieces.length > 0 && (
            <ul className="flex flex-col gap-1">
              {l.lesson_pieces.map((p) => (
                <li key={p.id}>
                  <span className="font-medium">{p.title}</span>{" "}
                  <span className="text-sm text-muted">{humanize(p.activity).toLowerCase()}</span>
                  {p.notes && <span className="block text-sm text-muted">{p.notes}</span>}
                </li>
              ))}
            </ul>
          )}
          {l.assignments.length > 0 && (
            <div>
              <div className="mb-1 text-[12px] font-semibold uppercase tracking-[0.1em] text-accent-ink">Home practice</div>
              <AssignmentList assignments={l.assignments} />
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <LinkButton href={`/v3/lessons/${l.id}`} className="min-h-11">
              {l.status === "draft" ? "Open and approve" : "Open the lesson story"}
            </LinkButton>
            {videos > 0 && (
              <span className="text-sm text-muted">
                {videos} video{videos === 1 ? "" : "s"}
              </span>
            )}
          </div>
        </Entry>
      ),
    });
  }

  // One practice entry per day: the parent's log and any recorded sessions.
  const byDay = new Map<string, { log?: Logs[number]; sessions: PracticeSessionView[] }>();
  for (const log of logs) byDay.set(log.practice_date, { log, sessions: [] });
  for (const s of sessions) {
    const d = byDay.get(s.practice_date) ?? { sessions: [] };
    d.sessions.push(s);
    byDay.set(s.practice_date, d);
  }
  for (const [date, { log, sessions: daySessions }] of byDay) {
    const minutes = log?.minutes ?? Math.round(daySessions.reduce((n, s) => n + (s.playing_seconds ?? 0), 0) / 60);
    const ticked = log?.completed_assignment_ids.length ?? 0;
    const grades = daySessions.map((s) => s.review?.grade).filter(Boolean);
    const did = minutes > 0 || ticked > 0 || daySessions.length > 0;
    out.push({
      key: `p-${date}`,
      kind: "practice",
      day: dayLabel(date),
      sort: `${date}-2`,
      node: (
        <Entry
          title={did ? `Practice${minutes ? `, ${minutes} min` : ""}` : "Practice log, nothing ticked"}
          meta={[
            ticked ? `${ticked} item${ticked === 1 ? "" : "s"} ticked` : "",
            log?.listened ? "listened" : "",
            daySessions.length ? `${daySessions.length} recorded` : "",
            log?.parent_note ? `“${log.parent_note}”` : "",
          ]
            .filter(Boolean)
            .join(" · ")}
          badge={grades.length ? <Pill tone="sage">{grades.join(" ")}</Pill> : undefined}
        >
          {log?.parent_note && (
            <p className="rounded-xl bg-plum-soft px-3 py-2 text-[15px]">
              <span className="font-medium text-plum">Parent: </span>
              {log.parent_note}
            </p>
          )}
          {daySessions.length > 0 ? (
            <PracticeSessionList sessions={daySessions} teacherView />
          ) : (
            <p className="text-sm text-muted">Logged by hand, no recording.</p>
          )}
        </Entry>
      ),
    });
  }

  for (const r of recordings) {
    const date = (r.lesson_id ? lessonDate.get(r.lesson_id) : null) ?? r.created_at.slice(0, 10);
    out.push({
      key: `v-${r.id}`,
      kind: "video",
      day: dayLabel(date),
      sort: `${date}-1`,
      node: (
        <Entry
          title={`Video: ${r.label || r.file_name}`}
          meta={[r.duration_seconds ? formatDuration(Number(r.duration_seconds)) : "", r.stream_status === "ready" ? "ready to stream" : ""]
            .filter(Boolean)
            .join(" · ")}
        >
          <p className="text-sm text-muted">
            Uploaded <LocalDateTime iso={r.created_at} />.
          </p>
          {r.lesson_id && (
            <LinkButton href={`/v3/lessons/${r.lesson_id}`} variant="secondary" className="min-h-11 self-start">
              Watch in the lesson story
            </LinkButton>
          )}
        </Entry>
      ),
    });
  }

  for (const p of periods) {
    const date = p.end;
    out.push({
      key: `r-${p.start}`,
      kind: "review",
      day: dayLabel(date),
      sort: `${date}-0`,
      node: (
        <Entry
          tone="plum"
          title={`Practice review: ${periodLabel(p)}`}
          meta={`${p.daysPracticed} of ${p.dayCount} days · ${p.totalMinutes} min${p.sessions ? ` · ${p.sessions} recorded` : ""}`}
        >
          {p.needsWriting && <PeriodReviewWriter studentId={studentId} start={p.start} auto quiet />}
          {p.encouragement && <p>{p.encouragement}</p>}
          <LinkButton href={`/family/${studentId}/review/${p.start}`} variant="secondary" className="min-h-11 self-start">
            Open the full review
          </LinkButton>
        </Entry>
      ),
    });
  }

  return out.sort((a, b) => b.sort.localeCompare(a.sort));
}

