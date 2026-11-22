"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { AddLessonOnDay } from "@/components/calendar-add";
import { DayRecordings } from "@/components/day-recordings";
import { cx, Pill } from "@/components/ui";
import { LocalTime } from "@/components/local-time";
import { PracticeReviewBody } from "@/components/practice-review";
import { GRADE_TONE, GradeLegend } from "@/components/grade-legend";
import { bestGrade, gradeMark, gradeName, gradingOfReviews } from "@/lib/grading";
import { formatDate } from "@/lib/format";
import type { DaySession, PracticeDay } from "@/lib/practice/data";
import { useBackToClose } from "@/lib/use-back-to-close";
import type { LessonMark } from "@/lib/lesson-mark-types";
import { formatTime } from "@/lib/schedule";
import Link from "next/link";

// A practice chart square. When the day has practice on record, tapping it
// opens a popup over the page with that day's sessions: a letter grade at
// the top, then the details and breakdown of each session. A lesson day
// opens the same popup with the lesson at the top (a link for the teacher).
// With `practiceHref` (Version 3 student page) the popup is a short list of
// what happened that day instead, each item opening its own page.

export function PracticeDayCell({
  day,
  date,
  lessons,
  teacherView = false,
  className,
  title,
  practiceHref,
  editHref,
  addPracticeHref,
  addLessonFor,
  manageFor,
  children,
}: {
  /** The teacher's student page: delete and combine a day's recordings from the list (the student's id). */
  manageFor?: string;
  /** The day can take a hand-added practice: its page, opened ready to fill in. */
  addPracticeHref?: string;
  /** The teacher can add a lesson on this day (the student's id). */
  addLessonFor?: string;
  /** List mode: the page for this day's practice; lessons link to their lesson page. */
  practiceHref?: string;
  /** The day's own page, where the family or teacher can change what was done. */
  editHref?: string;
  day?: PracticeDay;
  /** The cell's date; needed when a lesson day has no practice. */
  date?: string;
  lessons?: LessonMark[];
  teacherView?: boolean;
  className?: string;
  title?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const hasRecord = !!day && (day.minutes > 0 || day.ticked.length > 0 || day.listened || day.sessions.length > 0);
  const hasLesson = !!lessons?.length;
  const when = day?.date ?? date ?? lessons?.[0]?.date;
  const lastTap = useRef(0);
  const canAdd = !!when && (!!addPracticeHref || !!addLessonFor);
  // An empty day: a double click or double tap offers to add a lesson or practice.
  if (!hasRecord && !hasLesson && canAdd) {
    return (
      <>
        <button
          type="button"
          onClick={() => {
            const now = Date.now();
            if (now - lastTap.current < 400) {
              lastTap.current = 0;
              setOpen(true);
            } else lastTap.current = now;
          }}
          className={cx(className, "cursor-pointer select-none [touch-action:manipulation]")}
          title={`${title ?? ""} · double-tap to add`}
          aria-label={`Add a lesson or practice on ${formatDate(when!, "weekday")} (double-tap)`}
        >
          {children}
        </button>
        {open && (
          <DayPopup
            date={when!}
            lessons={[]}
            teacherView={teacherView}
            practiceHref={practiceHref ?? addPracticeHref}
            addPracticeHref={addPracticeHref}
            addLessonFor={addLessonFor}
            onClose={() => setOpen(false)}
          />
        )}
      </>
    );
  }
  if ((!hasRecord && !hasLesson) || !when) {
    return (
      <div className={className} title={title}>
        {children}
      </div>
    );
  }
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cx(className, "cursor-pointer transition active:scale-95")}
        title={title}
        aria-label={`${hasLesson ? (hasRecord ? "Lesson and practice" : "Lesson") : "Practice"} on ${formatDate(when, "weekday")}`}
      >
        {children}
      </button>
      {open && (
        <DayPopup
          date={when}
          day={hasRecord ? day : undefined}
          lessons={lessons ?? []}
          teacherView={teacherView}
          practiceHref={practiceHref}
          editHref={editHref}
          addPracticeHref={addPracticeHref}
          addLessonFor={addLessonFor}
          manageFor={manageFor}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function DayPopup({
  date,
  day,
  lessons,
  teacherView,
  practiceHref,
  editHref,
  addPracticeHref,
  addLessonFor,
  manageFor,
  onClose,
}: {
  date: string;
  day?: PracticeDay;
  lessons: LessonMark[];
  teacherView: boolean;
  practiceHref?: string;
  editHref?: string;
  addPracticeHref?: string;
  addLessonFor?: string;
  manageFor?: string;
  onClose: () => void;
}) {
  useBackToClose(true, onClose);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  const sessions = day?.sessions ?? [];
  const graded = sessions.filter((s) => s.review?.grade);
  const dayGrade = graded.length ? bestGrade(graded.map((s) => s.review!.grade!)) : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`${day ? "Practice" : "Lesson"} on ${formatDate(date, "long")}`}
    >
      <div
        className="flex max-h-[92dvh] w-full max-w-2xl flex-col overflow-y-auto rounded-t-2xl bg-paper text-ink shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-start gap-3 border-b border-rule bg-paper px-4 pt-3 pb-2.5">
          <div className="min-w-0 flex-1">
            <div className="text-[12px] font-semibold uppercase tracking-[0.12em] text-accent-ink">
              {lessons.length ? (day ? "Lesson and practice" : "Lesson") : day ? "Practice" : "Nothing yet"}
            </div>
            <div className="font-semibold">{formatDate(date, "long")}</div>
          </div>
          <button onClick={onClose} className="min-h-9 rounded-lg px-3 text-lg leading-none text-muted" aria-label="Close">
            ✕
          </button>
        </div>

        {practiceHref ? (
          <DayList
            date={date}
            day={day}
            lessons={lessons}
            practiceHref={practiceHref}
            dayGrade={dayGrade}
            addPracticeHref={addPracticeHref}
            addLessonFor={addLessonFor}
            manageFor={manageFor}
            onClose={onClose}
          />
        ) : (
        <div className="flex flex-col gap-4 px-4 py-4 text-[16px]">
          {lessons.map((l, i) => (
            <LessonRow key={l.lessonId ?? `${l.date}-${i}`} lesson={l} teacherView={teacherView} />
          ))}
          {!day && lessons.some((l) => !l.upcoming) && (
            <div className="text-sm text-muted">No practice logged this day.</div>
          )}
          {day && (
            <DayBody day={day} sessions={sessions} dayGrade={dayGrade} teacherView={teacherView} />
          )}
          {editHref && (day || lessons.some((l) => !l.upcoming)) && (
            <Link href={editHref} className="text-[16px] font-medium text-accent-ink underline">
              {day ? "Change what was done this day" : "Log practice for this day"}
            </Link>
          )}
        </div>
        )}
      </div>
    </div>
  );
}

function DayBody({
  day,
  sessions,
  dayGrade,
  teacherView,
}: {
  day: PracticeDay;
  sessions: DaySession[];
  dayGrade: string | null;
  teacherView: boolean;
}) {
  return (
    <>
          {sessions.length === 1 ? (
            <GradeBlock session={sessions[0]} />
          ) : dayGrade ? (
            <GradeBadgeRow grade={dayGrade} line={`Best of ${sessions.length} sessions today.`} />
          ) : null}
          {sessions.length > 0 && (
            <GradeLegend family={!teacherView} className="-mt-2" grading={gradingOfReviews(sessions.map((s) => s.review))} />
          )}

          <DayTotals day={day} />

          {sessions.length === 0 && (
            <div className="rounded-xl bg-sheet px-3 py-2 text-sm text-muted">
              No recorded session this day, so there&apos;s no grade. The practice was logged by hand.
            </div>
          )}

          {sessions.map((s, i) => (
            <SessionBlock
              key={s.id}
              s={s}
              titles={day.titles}
              handTicked={day.handTicked}
              teacherView={teacherView}
              heading={sessions.length > 1 ? `Session ${i + 1}` : null}
            />
          ))}

          {day.parentNote && (
            <div className="rounded-xl bg-plum-soft px-3 py-2 text-sm">
              <span className="font-medium text-plum">Parent&apos;s note: </span>
              {day.parentNote}
            </div>
          )}
    </>
  );
}

/** List mode: one tappable row per thing that happened that day. */
function DayList({
  date,
  day,
  lessons,
  practiceHref,
  dayGrade,
  addPracticeHref,
  addLessonFor,
  manageFor,
  onClose,
}: {
  date: string;
  addPracticeHref?: string;
  addLessonFor?: string;
  manageFor?: string;
  onClose: () => void;
  day?: PracticeDay;
  lessons: LessonMark[];
  practiceHref: string;
  dayGrade: string | null;
}) {
  const row = "flex min-h-16 items-center gap-3 rounded-2xl border px-3 py-2.5";
  const go = (
    <span aria-hidden className="ml-auto text-2xl leading-none text-muted">
      ›
    </span>
  );
  return (
    <ul className="flex flex-col gap-2 px-4 pt-4 pb-4 text-[16px]">
      <DayRecordings date={date} day={day} lessons={lessons} practiceHref={practiceHref} manageFor={manageFor} onClose={onClose} go={go} />
      {day && day.sessions.length === 0 && (
        <li>
          <Link href={practiceHref} className={cx(row, "border-sage/40 bg-sage-soft hover:border-sage")}>
            {dayGrade ? (
              <GradeBadge grade={dayGrade} small />
            ) : day.pending ? (
              <PendingMark stuck={day.pending === "stuck"} />
            ) : (
              <span className="h-5 w-5 shrink-0 rounded-full bg-sage" aria-hidden />
            )}
            <span className="min-w-0">
              <span className="block font-semibold">Practice{dayMinutes(day) ? `, ${dayMinutes(day)} min` : ""}</span>
              <span className="block text-sm text-muted">
                {[
                  practicePendingWords(day.pending),
                  day.sessions.length ? `${day.sessions.length} recorded` : "logged by hand",
                  day.ticked.length ? `${day.ticked.length} item${day.ticked.length === 1 ? "" : "s"} ticked` : "",
                  day.listened ? "listened" : "",
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
              {day.parentNote && <span className="mt-0.5 block text-sm text-plum">“{day.parentNote}”</span>}
            </span>
            {go}
          </Link>
        </li>
      )}
      {!day && lessons.some((l) => !l.upcoming) && !addPracticeHref && (
        <li className="text-sm text-muted">No practice logged this day.</li>
      )}
      {addLessonFor && !lessons.some((l) => l.lessonId) && (
        <li>
          <AddLessonOnDay studentId={addLessonFor} date={date} className={cx(row, "w-full border-dashed border-accent/50 text-left hover:border-accent")}>
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-accent text-[13px] font-bold leading-none text-accent-ink" aria-hidden>
              +
            </span>
            <span className="min-w-0">
              <span className="block font-semibold">Add lesson</span>
              <span className="block text-sm text-muted">Upload its video or write it up</span>
            </span>
            {go}
          </AddLessonOnDay>
        </li>
      )}
      {addPracticeHref && !day && (
        <li>
          <Link href={addPracticeHref} className={cx(row, "border-dashed border-sage/60 hover:border-sage")}>
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-sage text-[13px] font-bold leading-none text-sage" aria-hidden>
              +
            </span>
            <span className="min-w-0">
              <span className="block font-semibold">Add practice</span>
              <span className="block text-sm text-muted">Minutes, what was done, a note</span>
            </span>
            {go}
          </Link>
        </li>
      )}
    </ul>
  );
}

/** The lesson line at the top of a day popup. */
function LessonRow({ lesson, teacherView }: { lesson: LessonMark; teacherView: boolean }) {
  const line = lesson.upcoming
    ? `Lesson scheduled${lesson.time ? ` at ${formatTime(lesson.time)}` : ""}${lesson.minutes ? `, ${lesson.minutes} min` : ""}.`
    : `Lesson${lesson.minutes ? `, ${lesson.minutes} min` : ""}${
        lesson.pending === "processing"
          ? " (the video is being processed)"
          : lesson.pending === "review"
            ? teacherView && lesson.lessonId
              ? " (write-up still a draft)"
              : " (the write-up is on its way)"
            : ""
      }.`;
  return (
    <div className="flex items-center gap-3 rounded-xl border border-accent/40 bg-accent-soft px-3 py-2">
      <LessonNote upcoming={lesson.upcoming} />
      <span className="min-w-0 flex-1">{line}</span>
      {teacherView && lesson.lessonId && (
        <Link href={`/lessons/${lesson.lessonId}`} className="shrink-0 text-sm font-medium text-accent-ink underline">
          Open lesson
        </Link>
      )}
    </div>
  );
}

/** The lesson marker used on the calendars and their legends: filled for a lesson taught, outlined for one coming up. */
export function LessonNote({ upcoming = false, small = false }: { upcoming?: boolean; small?: boolean }) {
  return (
    <span
      className={cx(
        "inline-flex shrink-0 items-center justify-center rounded-full font-bold leading-none",
        small ? "h-3.5 w-3.5 text-[9px]" : "h-5 w-5 text-[12px]",
        upcoming ? "border border-accent bg-paper text-accent-ink" : "bg-accent text-white",
      )}
      aria-hidden
    >
      ♪
    </span>
  );
}


/**
 * The mark for something finished that isn't done on record yet: a practice
 * being uploaded or reviewed, or a lesson being processed or waiting for the
 * teacher's approval ("…"); or an upload or review that didn't finish ("!").
 */
export function PendingMark({ stuck = false, small = false }: { stuck?: boolean; small?: boolean }) {
  return (
    <span
      className={cx(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-amber font-bold leading-none text-white",
        small ? "h-3.5 w-3.5 text-[9px]" : "h-5 w-5 text-[12px]",
      )}
      aria-hidden
    >
      {stuck ? "!" : "…"}
    </span>
  );
}

/** Words for a day's unfinished practice, for popups and day lists. */
export function practicePendingWords(p: PracticeDay["pending"]): string {
  return p === "stuck" ? "needs a look: the upload or review didn't finish" : p === "processing" ? "processing, review on its way" : "";
}

/** Words for a lesson that isn't approved yet. */
export function lessonPendingWords(l: LessonMark, teacherView = true): string {
  if (l.pending === "processing") return "processing the video";
  if (l.pending === "review") return teacherView && l.lessonId ? "draft to approve" : "write-up on its way";
  return "";
}

function GradeBadge({ grade, small }: { grade: string | null; small?: boolean }) {
  return (
    <span
      className={cx(
        "flex shrink-0 items-center justify-center rounded-2xl font-display font-semibold",
        small ? "h-10 w-10 text-xl" : "h-16 w-16 text-4xl",
        grade ? GRADE_TONE[grade] : "border border-dashed border-rule text-muted",
      )}
      aria-label={grade ? gradeName(grade) : "No grade"}
    >
      {grade ? gradeMark(grade) : "–"}
    </span>
  );
}

function GradeBadgeRow({ grade, line, small }: { grade: string | null; line: ReactNode; small?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <GradeBadge grade={grade} small={small} />
      <div className="min-w-0 flex-1">
        {!small && <div className="text-[12px] font-semibold uppercase tracking-[0.12em] text-muted">Practice grade</div>}
        <div className={cx(small ? "text-[15px]" : "text-[16px]")}>{line}</div>
      </div>
    </div>
  );
}

function gradeLine(s: DaySession): { grade: string | null; line: string } {
  const r = s.review;
  if (s.pending === "stuck" && s.status === "uploading")
    return { grade: null, line: "The recording didn't finish uploading. Open the day to delete it or record again." };
  if (s.status === "uploading") return { grade: null, line: "Still sending the recording. The review and grade come after." };
  if (s.status === "transcribing" || s.status === "analyzing") return { grade: null, line: "Still listening back. The grade comes with the review." };
  if (s.status === "error") return { grade: null, line: "The review didn't finish, so there's no grade." };
  if (!r) return { grade: null, line: "No review yet." };
  if (r.counted === false || s.counted === false) return { grade: null, line: "Not counted as practice, so no grade." };
  if (!r.grade) return { grade: null, line: "No grade: this session was reviewed before grades were added." };
  return { grade: r.grade, line: r.grade_reason || "" };
}

function GradeBlock({ session, small }: { session: DaySession; small?: boolean }) {
  if (session.review?.grading?.system === "none") return null;
  const { grade, line } = gradeLine(session);
  return <GradeBadgeRow grade={grade} line={line} small={small} />;
}

function minutesText(seconds: number): string {
  const m = Math.round(seconds / 60);
  return m < 1 ? "under a minute" : `${m} min`;
}

function DayTotals({ day }: { day: PracticeDay }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5">
        {day.minutes > 0 && <Pill tone="sage">{day.minutes} min practiced</Pill>}
        {!day.minutes && day.pendingMinutes > 0 && <Pill tone="sage">{day.pendingMinutes} min recorded</Pill>}
        {day.pending && <Pill tone="amber">{day.pending === "stuck" ? "needs a look" : "processing"}</Pill>}
        {day.listened && <Pill tone="plum">listened</Pill>}
        {day.sessions.length > 1 && <Pill>{day.sessions.length} sessions</Pill>}
      </div>
      {day.ticked.length > 0 && day.sessions.length === 0 && (
        <ul className="flex flex-col gap-1.5">
          {day.ticked.map((t) => (
            <li key={t} className="flex items-center gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sage text-xs text-white">✓</span>
              {t}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SessionBlock({
  s,
  titles,
  handTicked,
  teacherView,
  heading,
}: {
  s: DaySession;
  titles: Record<string, string>;
  handTicked: string[];
  teacherView: boolean;
  heading: string | null;
}) {
  const r = s.review;
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-rule bg-sheet p-3">
      {heading && (
        <div className="flex flex-col gap-2">
          <div className="text-[12px] font-semibold uppercase tracking-[0.12em] text-accent-ink">{heading}</div>
          <GradeBlock session={s} small />
        </div>
      )}
      {s.recording_missing && (
        <div className="flex items-start gap-2 rounded-xl bg-danger-soft px-3 py-2 text-sm">
          <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-danger text-[10px] font-bold text-white">
            !
          </span>
          <span>
            Logged by Start/Stop, no audio recording. The recording didn&apos;t upload, so nothing was transcribed;
            {s.review?.items.length ? " the review is from the sound levels and notes the phone noted while recording." : " there is no review."}
          </span>
        </div>
      )}
      <div className="text-sm text-muted">
        Started <LocalTime iso={s.started_at} /> · {minutesText(s.duration_seconds)} session ·{" "}
        {minutesText(s.playing_seconds)} playing{s.media === "video" ? " · video" : ""}
        {s.with_helper ? " · with a helper" : ""}
      </div>
      {r?.summary && <div>{r.summary}</div>}
      {r && <PracticeReviewBody review={r} titles={titles} teacherView={teacherView} handTicked={handTicked} />}
    </section>
  );
}

/** Minutes for a day: the log's, or while the review is still coming, the recorded sessions'. */
export function dayMinutes(day: PracticeDay | undefined): number {
  if (!day) return 0;
  return day.minutes || day.pendingMinutes;
}
