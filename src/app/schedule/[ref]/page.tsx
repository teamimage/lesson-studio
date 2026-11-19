import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Shell } from "@/components/shell";
import { Button, Input, Pill, Select, cx } from "@/components/ui";
import { MinutesSelect } from "@/components/lesson-times";
import { TimePicker } from "@/components/time-picker";
import { startLesson } from "@/app/lessons/live-actions";
import { changeLesson, moveExtraLesson, undoChange } from "@/app/downbeat/actions";
import { requireTeacher } from "@/lib/auth";
import { listLessons, listStudents } from "@/lib/data";
import { addDays, formatDate, todayISO } from "@/lib/format";
import { getConsentStatus } from "@/lib/recording-consent-data";
import { consentPath } from "@/lib/recording-consent";
import {
  type Occurrence,
  cancelLabel,
  endTime,
  formatTime,
  hoursUntil,
  makeupsOwed,
  parseOccurrenceRef,
} from "@/lib/schedule";
import { loadSchedule, loadScheduleSettings, scheduleBetween } from "@/lib/schedule-data";

type Params = Promise<{ ref: string }>;

// One scheduled lesson, with everything you can do to it in plain view:
// start it, move it, cancel it (teacher or family), mark a no-show, undo a
// change, or add it to your own calendar. Intro's lesson rows link here.
export default function ScheduledLessonPage({ params }: { params: Params }) {
  return (
    <Shell title="Lesson" back={{ href: "/downbeat", label: "Intro" }} tab="downbeat">
      <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-sheet" />}>
        <Body params={params} />
      </Suspense>
    </Shell>
  );
}

async function Body({ params }: { params: Params }) {
  const { teacher } = await requireTeacher();
  const { ref } = await params;
  const parsed = parseOccurrenceRef(ref);
  if (!parsed) notFound();
  const today = todayISO();
  const students = (await listStudents()).filter((s) => s.active);
  const near = "changeId" in parsed ? today : parsed.date;
  const [schedule, settings] = await Promise.all([loadSchedule(students, addDays(near, -400)), loadScheduleSettings(teacher.id)]);
  const all = scheduleBetween(schedule, addDays(near, -400), addDays(near, 400));
  const occ =
    "changeId" in parsed
      ? all.find((o) => o.kind === "extra" && o.changeId === parsed.changeId)
      : all.find((o) => o.slotId === parsed.slotId && o.slotDate === parsed.date);
  if (!occ) notFound();
  const student = students.find((s) => s.id === occ.studentId);
  if (!student) notFound();

  const [lessons, consent] = await Promise.all([listLessons(student.id, 20), getConsentStatus(student.id)]);
  const record = lessons.find((l) => l.lesson_date === occ.date);
  const nameOf = new Map(students.map((s) => [s.id, s.name]));
  const owed = makeupsOwed(schedule.changes, student.id);
  const madeUp = occ.makeupFor ? schedule.changes.find((c) => c.id === occ.makeupFor) : null;
  const notice = hoursUntil(occ.date, occ.time, settings.timeZone);
  const familyEarnsMakeup = notice >= settings.noticeHours;
  const past = occ.date < today;
  const off = occ.kind === "cancelled" || occ.kind === "noshow";
  const here = `/schedule/${ref}`;

  return (
    <div className="flex flex-col gap-7">
      {/* What and when */}
      <header className="flex flex-col gap-1">
        <Link href={`/students/${student.id}`} className="font-display text-[28px] font-semibold leading-tight text-ink no-underline">
          {student.name}
        </Link>
        <div className={cx("text-[18px]", off && "text-muted line-through")}>
          {formatDate(occ.date, "long")}
        </div>
        <div className={cx("text-[18px]", off && "text-muted line-through")}>
          {occ.time ? `${formatTime(occ.time)} – ${formatTime(endTime(occ.time, occ.minutes))}` : "Time not set"} · {occ.minutes} min
        </div>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {off && <Pill tone={occ.kind === "noshow" ? "danger" : "muted"}>{cancelLabel(occ)}</Pill>}
          {occ.kind === "moved" && occ.from && <Pill tone="plum">moved from {formatDate(occ.from, "weekday")}</Pill>}
          {occ.kind === "extra" && <Pill tone="plum">{madeUp ? `make-up for ${formatDate(madeUp.on_date)}` : "one-off"}</Pill>}
          {occ.makeupOwed && <Pill tone="amber">make-up owed</Pill>}
          {record && <Pill tone={record.status === "draft" ? "amber" : "sage"}>{record.status === "draft" ? "draft record" : "✓ held"}</Pill>}
          {owed.length > 0 && !occ.makeupOwed && <Pill tone="amber">{owed.length} make-up{owed.length === 1 ? "" : "s"} owed</Pill>}
        </div>
        {occ.note && <p className="mt-1 text-[16px] text-muted">{occ.note}</p>}
        {occ.overlaps.length > 0 && !off && (
          <p className="mt-2 text-[16px] font-medium text-danger">
            Overlaps {occ.overlaps.map((id) => nameOf.get(id) ?? "another lesson").join(" and ")}.
          </p>
        )}
      </header>

      {/* Do it */}
      {!off && occ.date === today && !record && (
        consent.state === "signed" ? (
          <form action={startLesson}>
            <input type="hidden" name="student_id" value={student.id} />
            <Button className="min-h-14 w-full text-lg">Start lesson</Button>
          </form>
        ) : (
          <Link href={consentPath(student.id, here)} className="text-[16px] font-semibold text-danger">
            Parent consent needed before recording ›
          </Link>
        )
      )}
      {record && (
        <Link href={`/lessons/${record.id}`} className="text-[17px] font-semibold text-accent-ink">
          Open the lesson record ›
        </Link>
      )}

      {/* Undo a change */}
      {occ.changeId && occ.kind !== "regular" && occ.cancelledBy !== "studio" && (
        <Section title={occ.kind === "extra" ? "Remove this lesson" : occ.kind === "moved" ? "Move it back" : "Undo"}>
          <form action={undoChange}>
            <input type="hidden" name="change_id" value={occ.changeId} />
            <input type="hidden" name="next" value={occ.kind === "extra" ? "/downbeat" : here} />
            <Button variant="secondary">
              {occ.kind === "extra"
                ? "Remove this one-off lesson"
                : occ.kind === "moved"
                  ? `Back to ${formatDate(occ.from, "weekday")}`
                  : occ.kind === "noshow"
                    ? "Undo no-show"
                    : "Undo cancel"}
            </Button>
          </form>
        </Section>
      )}
      {occ.cancelledBy === "studio" && (
        <p className="text-[16px] text-muted">
          Studio closed. To bring this lesson back, remove the closure in{" "}
          <Link href="/settings/lesson-times#closed">Lesson times</Link>.
        </p>
      )}

      {/* Move */}
      {!record && !off && (
        <Section title={occ.kind === "extra" ? "Move this lesson" : "Move this week's lesson"}>
          {occ.kind === "extra" ? (
            <form action={moveExtraLesson} className="grid gap-2 sm:grid-cols-[1.3fr_1fr_1fr_auto]">
              <input type="hidden" name="change_id" value={occ.changeId ?? ""} />
              <input type="hidden" name="next" value={here} />
              <Input type="date" name="on_date" aria-label="New date" defaultValue={occ.date} required />
              <TimePicker name="start_time" label="New time" defaultValue={occ.time ?? ""} required />
              <MinutesSelect value={occ.minutes} />
              <Button variant="secondary">Move</Button>
            </form>
          ) : (
            <form action={changeLesson} className="grid gap-2 sm:grid-cols-[1.3fr_1fr_1fr_auto]">
              <ChangeKeys occ={occ} kind="move" next={here} />
              <Input type="date" name="new_date" aria-label="New date" defaultValue={occ.date} required />
              <TimePicker name="new_time" label="New time" defaultValue={occ.time ?? ""} required />
              <MinutesSelect value={occ.minutes} />
              <Button variant="secondary">Move</Button>
            </form>
          )}
        </Section>
      )}

      {/* Cancel */}
      {!record && !off && occ.kind !== "extra" && (
        <Section title="Cancel this week's lesson">
          <form action={changeLesson} className="flex flex-col gap-3">
            <ChangeKeys occ={occ} kind="cancel" next={here} />
            {schedule.foundation && (
              <>
                <fieldset className="flex flex-col gap-2 text-[16px]">
                  <legend className="mb-1 text-sm text-muted">Who cancelled?</legend>
                  <label className="flex min-h-11 items-center gap-2">
                    <input type="radio" name="cancelled_by" value="teacher" defaultChecked className="size-5" /> I did (a make-up is owed)
                  </label>
                  <label className="flex min-h-11 items-center gap-2">
                    <input type="radio" name="cancelled_by" value="family" className="size-5" /> The family
                  </label>
                </fieldset>
                <label className="flex flex-col gap-1 text-[16px]">
                  <span className="text-sm text-muted">
                    Make-up owed? With {settings.noticeHours} hours&apos; notice a family cancellation earns one
                    {past ? "." : familyEarnsMakeup ? ": this one has enough notice." : ": this one is too late."}
                  </span>
                  <Select name="makeup_owed" defaultValue={familyEarnsMakeup ? "1" : "0"} aria-label="Make-up owed">
                    <option value="1">Yes, a make-up is owed</option>
                    <option value="0">No make-up</option>
                  </Select>
                </label>
                <p className="-mt-1 text-sm text-muted">If you cancelled, a make-up is always owed whatever this says.</p>
                <Input name="note" aria-label="Reason" placeholder="Reason (optional), e.g. sick" maxLength={200} />
              </>
            )}
            <Button variant="danger" className="self-start">Cancel this lesson</Button>
          </form>
        </Section>
      )}

      {/* No-show */}
      {!record && !off && occ.kind !== "extra" && occ.date <= today && schedule.foundation && (
        <Section title="Didn't come">
          <form action={changeLesson}>
            <ChangeKeys occ={occ} kind="noshow" next={here} />
            <input type="hidden" name="makeup_owed" value="0" />
            <Button variant="secondary">Mark as no-show</Button>
          </form>
        </Section>
      )}

      {/* Own calendar */}
      {occ.time && !off && (
        <Section title="Your calendar">
          <a href={`/api/calendar/lesson/${ref}`} className="text-[17px] font-semibold text-accent-ink">
            Add this lesson to my calendar ›
          </a>
          <p className="text-sm text-muted">
            For every lesson at once, use the calendar link in{" "}
            <Link href="/settings/lesson-times#calendar">Lesson times</Link>.
          </p>
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2 border-t border-rule pt-4">
      <h2 className="text-[17px] font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function ChangeKeys({ occ, kind, next }: { occ: Occurrence; kind: string; next: string }) {
  return (
    <>
      <input type="hidden" name="student_id" value={occ.studentId} />
      <input type="hidden" name="slot_id" value={occ.slotId ?? ""} />
      <input type="hidden" name="on_date" value={occ.slotDate ?? occ.date} />
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="next" value={next} />
    </>
  );
}
