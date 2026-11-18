import { Button, Input, Select } from "@/components/ui";
import {
  addClosure,
  addExtraLesson,
  addSlot,
  changeSlotFrom,
  removeClosure,
  saveScheduleSettings,
  stopSlot,
} from "@/app/downbeat/actions";
import type { Student } from "@/lib/data";
import { formatDate } from "@/lib/format";
import { type Closure, type Slot, type SlotChange, WEEKDAY_NAMES, fallbackSlot, makeupsOwed, slotSentence } from "@/lib/schedule";
import type { ScheduleSettings } from "@/lib/schedule-data";

// Lesson times: each student's regular lesson, one-off and make-up lessons,
// studio closed dates, and the teacher's time zone and make-up rule. Lives on
// Settings → Lesson times. Intro, Today, the student and family pages and the
// calendar links all read from what is set here.

const BACK = "/settings/lesson-times";

export function LessonTimes({
  students,
  slots,
  changes,
  closures,
  ready,
  foundation,
  today,
  settings,
}: {
  students: Student[];
  slots: Slot[];
  changes: SlotChange[];
  closures: Closure[];
  ready: boolean;
  /** schedule-foundation.sql has run: every other week, closures, make-ups, settings. */
  foundation: boolean;
  today: string;
  settings: ScheduleSettings;
}) {
  if (!ready) {
    return (
      <p className="text-[16px] text-muted">
        Run lesson-schedule.sql first. It also copies each student&apos;s current Lesson day and time in as their
        regular lesson.
      </p>
    );
  }
  if (students.length === 0) return <p className="text-[16px] text-muted">Add a student first.</p>;
  const owedAll = makeupsOwed(changes);
  const nameOf = new Map(students.map((s) => [s.id, s.name]));
  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col">
        <H2>Regular lessons</H2>
        <ul className="flex flex-col divide-y divide-rule">
          {students.map((s) => {
            const owed = owedAll.filter((c) => c.student_id === s.id);
            return (
              <li key={s.id} className="flex flex-col gap-2 py-4">
                <div className="flex flex-wrap items-baseline gap-x-3">
                  <span className="text-[17px] font-semibold">{s.name}</span>
                  {owed.length > 0 && (
                    <span className="text-sm font-medium text-amber">
                      {owed.length} make-up{owed.length === 1 ? "" : "s"} owed ({owed.map((c) => formatDate(c.on_date)).join(", ")})
                    </span>
                  )}
                </div>
                <SlotList studentId={s.id} slots={slots} today={today} foundation={foundation} />
                <details className="group">
                  <summary className="inline-flex min-h-9 cursor-pointer list-none items-center text-sm font-medium text-accent-ink [&::-webkit-details-marker]:hidden">
                    Add a lesson time <span className="ml-1 transition-transform group-open:rotate-90" aria-hidden>›</span>
                  </summary>
                  <AddSlotForm student={s} today={today} foundation={foundation} />
                </details>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="flex flex-col gap-2">
        <H2>One-off or make-up lesson</H2>
        <form action={addExtraLesson} className="grid gap-2 sm:grid-cols-[2fr_1.3fr_1fr_1fr]">
          <input type="hidden" name="next" value={BACK} />
          <Select name="student_id" aria-label="Student" required>
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
          <Input type="date" name="on_date" aria-label="Date" defaultValue={today} required />
          <Input type="time" name="start_time" aria-label="Start time" required />
          <MinutesSelect />
          {foundation && owedAll.length > 0 && (
            <Select name="makeup_for" aria-label="Make-up for" defaultValue="" className="sm:col-span-3">
              <option value="">Not a make-up</option>
              {owedAll.map((c) => (
                <option key={c.id} value={c.id}>
                  Make-up for {nameOf.get(c.student_id) ?? "student"}, {formatDate(c.on_date, "weekday")}
                </option>
              ))}
            </Select>
          )}
          <Button variant="secondary">Add</Button>
        </form>
      </section>

      {foundation && (
        <section id="closed" className="flex flex-col gap-2">
          <H2>Studio closed</H2>
          <p className="text-[15px] text-muted">Holidays and breaks. Every lesson in the dates is cancelled; remove the dates to bring them back.</p>
          {closures.filter((c) => c.ends_on >= today).length > 0 && (
            <ul className="flex flex-col gap-1">
              {closures
                .filter((c) => c.ends_on >= today)
                .sort((a, b) => a.starts_on.localeCompare(b.starts_on))
                .map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center gap-2 text-[16px]">
                    <span>
                      {formatDate(c.starts_on, "weekday")}
                      {c.ends_on !== c.starts_on ? ` – ${formatDate(c.ends_on, "weekday")}` : ""}
                      {c.note ? `: ${c.note}` : ""}
                      {c.makeup_owed ? " (make-ups owed)" : ""}
                    </span>
                    <form action={removeClosure} className="ml-auto">
                      <input type="hidden" name="closure_id" value={c.id} />
                      <input type="hidden" name="next" value={BACK} />
                      <button className="min-h-9 text-sm font-medium text-danger underline">Remove</button>
                    </form>
                  </li>
                ))}
            </ul>
          )}
          <form action={addClosure} className="grid gap-2 sm:grid-cols-[1fr_1fr_2fr]">
            <input type="hidden" name="next" value={BACK} />
            <label className="flex flex-col gap-1 text-sm text-muted">
              From
              <Input type="date" name="starts_on" defaultValue={today} required />
            </label>
            <label className="flex flex-col gap-1 text-sm text-muted">
              To
              <Input type="date" name="ends_on" defaultValue={today} required />
            </label>
            <label className="flex flex-col gap-1 text-sm text-muted">
              Why
              <Input name="note" placeholder="e.g. Thanksgiving" maxLength={200} />
            </label>
            <label className="flex min-h-11 items-center gap-2 text-[16px] sm:col-span-2">
              <input type="checkbox" name="makeup_owed" value="1" className="size-5" /> Make-ups owed for these lessons
            </label>
            <Button variant="secondary">Close the studio</Button>
          </form>
        </section>
      )}

      {foundation && (
        <section className="flex flex-col gap-2">
          <H2>Time zone and make-ups</H2>
          <form action={saveScheduleSettings} className="grid gap-2 sm:grid-cols-[2fr_1fr_auto] sm:items-end">
            <input type="hidden" name="next" value={BACK} />
            <label className="flex flex-col gap-1 text-sm text-muted">
              Your time zone
              <Select name="time_zone" defaultValue={settings.timeZone}>
                {timeZones(settings.timeZone).map((z) => (
                  <option key={z} value={z}>
                    {z.replace(/_/g, " ")}
                  </option>
                ))}
              </Select>
            </label>
            <label className="flex flex-col gap-1 text-sm text-muted">
              Notice for a make-up (hours)
              <Input type="number" name="makeup_notice_hours" min={0} max={336} defaultValue={settings.noticeHours} />
            </label>
            <Button variant="secondary">Save</Button>
          </form>
          <p className="text-[15px] text-muted">
            A family that cancels at least {settings.noticeHours} hours ahead is owed a make-up. You can change it on each
            cancellation.
          </p>
        </section>
      )}
    </div>
  );
}

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-1 font-display text-[21px] font-semibold">{children}</h2>;
}

function timeZones(current: string): string[] {
  const common = ["America/New_York", "America/Chicago", "America/Denver", "America/Phoenix", "America/Los_Angeles", "America/Anchorage", "Pacific/Honolulu"];
  let all: string[] = [];
  try {
    all = Intl.supportedValuesOf("timeZone");
  } catch {
    all = [];
  }
  return Array.from(new Set([current, ...common, ...all]));
}

function SlotList({ studentId, slots, today, foundation }: { studentId: string; slots: Slot[]; today: string; foundation: boolean }) {
  const saved = slots
    .filter((s) => !s.fallback && s.student_id === studentId && (!s.ends_on || s.ends_on >= today))
    .sort((a, b) => (a.starts_on ?? "").localeCompare(b.starts_on ?? ""));
  if (saved.length === 0) return <p className="text-sm text-muted">No regular lesson yet.</p>;
  return (
    <ul className="flex flex-col gap-2">
      {saved.map((slot) => (
        <li key={slot.id} className="flex flex-col gap-1">
          <span className="text-[16px]">
            {slotSentence(slot)}
            {slot.starts_on && slot.starts_on > today ? `, from ${formatDate(slot.starts_on)}` : ""}
            {slot.ends_on ? `, last one ${formatDate(slot.ends_on)}` : ""}
          </span>
          <details className="group">
            <summary className="inline-flex min-h-9 cursor-pointer list-none items-center text-sm font-medium text-accent-ink [&::-webkit-details-marker]:hidden">
              Change or stop <span className="ml-1 transition-transform group-open:rotate-90" aria-hidden>›</span>
            </summary>
            <div className="mt-1 flex flex-col gap-4">
              <form action={changeSlotFrom} className="grid gap-2 sm:grid-cols-[1.2fr_1.3fr_1fr_1fr]">
                <input type="hidden" name="slot_id" value={slot.id} />
                <input type="hidden" name="next" value={BACK} />
                <label className="flex flex-col gap-1 text-sm text-muted sm:col-span-4">
                  New time from
                  <Input type="date" name="from" defaultValue={today} min={today} required />
                </label>
                <DaySelect value={slot.weekday} />
                <Input type="time" name="start_time" aria-label="Start time" defaultValue={slot.start_time?.slice(0, 5) ?? ""} required />
                <MinutesSelect value={slot.minutes} />
                {foundation && <EverySelect value={slot.every_weeks ?? 1} />}
                <Button variant="secondary" className="sm:col-span-4 sm:justify-self-start">
                  Change from that date
                </Button>
              </form>
              <form action={stopSlot} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="slot_id" value={slot.id} />
                <input type="hidden" name="next" value={BACK} />
                <label className="flex flex-col gap-1 text-sm text-muted">
                  No lessons from
                  <Input type="date" name="from" defaultValue={today} required />
                </label>
                <Button variant="danger">Stop</Button>
              </form>
              <p className="text-sm text-muted">Earlier lessons stay on the calendar either way.</p>
            </div>
          </details>
        </li>
      ))}
    </ul>
  );
}

function AddSlotForm({ student, today, foundation }: { student: Student; today: string; foundation: boolean }) {
  return (
    <form action={addSlot} className="mt-1 grid gap-2 sm:grid-cols-[1.3fr_1fr_1fr_1fr]">
      <input type="hidden" name="student_id" value={student.id} />
      <input type="hidden" name="next" value={BACK} />
      <DaySelect value={fallbackSlot(student)?.weekday ?? 1} />
      <Input type="time" name="start_time" aria-label="Start time" required />
      <MinutesSelect />
      {foundation && <EverySelect value={1} />}
      {foundation && (
        <label className="flex flex-col gap-1 text-sm text-muted sm:col-span-2">
          Starting
          <Input type="date" name="starts_on" defaultValue={today} />
        </label>
      )}
      <Button variant="secondary" className="sm:self-end">
        Add lesson time
      </Button>
    </form>
  );
}

function DaySelect({ value }: { value: number }) {
  return (
    <Select name="weekday" aria-label="Day" defaultValue={String(value)}>
      {WEEKDAY_NAMES.map((d, i) => (
        <option key={d} value={i}>
          {d}
        </option>
      ))}
    </Select>
  );
}

function EverySelect({ value }: { value: number }) {
  return (
    <Select name="every_weeks" aria-label="How often" defaultValue={String(value)}>
      <option value="1">Every week</option>
      <option value="2">Every other week</option>
    </Select>
  );
}

export function MinutesSelect({ value = 30 }: { value?: number }) {
  const options = Array.from(new Set([15, 20, 30, 45, 60, 75, 90, value])).sort((a, b) => a - b);
  return (
    <Select name="minutes" aria-label="Length" defaultValue={String(value)}>
      {options.map((m) => (
        <option key={m} value={m}>
          {m} min
        </option>
      ))}
    </Select>
  );
}
