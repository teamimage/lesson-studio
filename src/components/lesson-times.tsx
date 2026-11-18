import { Button, Input, Select } from "@/components/ui";
import { addExtraLesson, addSlot, removeSlot } from "@/app/downbeat/actions";
import type { Student } from "@/lib/data";
import { formatDate } from "@/lib/format";
import { type Slot, WEEKDAY_NAMES, fallbackSlot, formatTime } from "@/lib/schedule";

// Lesson times: each student's regular weekly lesson, plus one-off lessons.
// Lives on Settings → Lesson times (it used to sit at the bottom of Intro).
export function LessonTimes({
  students,
  slots,
  ready,
  today,
}: {
  students: Student[];
  slots: Slot[];
  ready: boolean;
  today: string;
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
  return (
    <div className="flex flex-col gap-5">
      <ul className="flex flex-col divide-y divide-rule">
        {students.map((s) => (
          <li key={s.id} className="py-3">
            <div className="mb-2 text-[17px] font-semibold">{s.name}</div>
            <SlotList studentId={s.id} slots={slots} />
            <AddSlotForm student={s} />
          </li>
        ))}
      </ul>
      <section>
        <div className="mb-2 text-[17px] font-semibold">One-off lesson</div>
        <form action={addExtraLesson} className="grid gap-2 sm:grid-cols-[2fr_1.3fr_1fr_1fr_auto]">
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
          <Button variant="secondary">Add</Button>
        </form>
      </section>
    </div>
  );
}

function SlotList({ studentId, slots }: { studentId: string; slots: Slot[] }) {
  const saved = slots.filter((s) => !s.fallback && s.student_id === studentId);
  if (saved.length === 0) return <p className="mb-2 text-sm text-muted">No regular lesson yet.</p>;
  return (
    <ul className="mb-2 flex flex-col gap-1">
      {saved.map((slot) => (
        <li key={slot.id} className="flex flex-wrap items-center gap-2 text-[16px]">
          <span>
            Every {WEEKDAY_NAMES[slot.weekday]} at {formatTime(slot.start_time)}, {slot.minutes} min
            {slot.starts_on ? ` (from ${formatDate(slot.starts_on)})` : ""}
          </span>
          <form action={removeSlot} className="ml-auto">
            <input type="hidden" name="slot_id" value={slot.id} />
            <button className="min-h-9 text-sm font-medium text-danger underline">Remove</button>
          </form>
        </li>
      ))}
    </ul>
  );
}

function AddSlotForm({ student }: { student: Student }) {
  return (
    <form action={addSlot} className="grid gap-2 sm:grid-cols-[1.3fr_1fr_1fr_auto]">
      <input type="hidden" name="student_id" value={student.id} />
      <Select name="weekday" aria-label="Day" defaultValue={String(fallbackSlot(student)?.weekday ?? 1)}>
        {WEEKDAY_NAMES.map((d, i) => (
          <option key={d} value={i}>
            Every {d}
          </option>
        ))}
      </Select>
      <Input type="time" name="start_time" aria-label="Start time" required />
      <MinutesSelect />
      <Button variant="secondary">Add lesson time</Button>
    </form>
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

