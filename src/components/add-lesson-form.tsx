"use client";

import { useState } from "react";
import { addLesson } from "@/app/downbeat/actions";
import { Button, Field, Input, Select, cx } from "@/components/ui";
import { endTime, formatTime, toMinutes } from "@/lib/schedule";

export type Pupil = { id: string; name: string; minutes: number };
export type Booked = { date: string; time: string; minutes: number; name: string };

const LENGTHS = [15, 20, 30, 45, 60, 75, 90];

function dayName(d: string) {
  return new Date(`${d}T12:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
}

export function AddLessonForm({
  pupils,
  booked,
  date: initialDate,
  next,
  student: initialStudent,
  everyOtherWeek,
}: {
  pupils: Pupil[];
  booked: Booked[];
  date: string;
  next: string;
  student: string | null;
  everyOtherWeek: boolean;
}) {
  const [studentId, setStudentId] = useState(pupils.some((p) => p.id === initialStudent) ? initialStudent! : "");
  const [date, setDate] = useState(initialDate);
  const [time, setTime] = useState("");
  const pupil = pupils.find((p) => p.id === studentId);
  const [minutes, setMinutes] = useState(pupil?.minutes ?? 30);
  const [repeat, setRepeat] = useState("once");

  const sameDay = booked.filter((b) => b.date === date).sort((a, b) => a.time.localeCompare(b.time));
  const start = /^\d{2}:\d{2}$/.test(time) ? toMinutes(time) : null;
  const clashes =
    start === null ? [] : sameDay.filter((b) => toMinutes(b.time) < start + minutes && start < toMinutes(b.time) + b.minutes);
  const lengths = LENGTHS.includes(minutes) ? LENGTHS : [...LENGTHS, minutes].sort((a, b) => a - b);

  return (
    <form action={addLesson} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />
      <Field label="Student">
        <Select
          name="student_id"
          required
          value={studentId}
          onChange={(e) => {
            setStudentId(e.target.value);
            const p = pupils.find((x) => x.id === e.target.value);
            if (p) setMinutes(p.minutes);
          }}
        >
          <option value="" disabled>
            Choose a student
          </option>
          {pupils.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date">
          <Input name="on_date" type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Time">
          <Input name="start_time" type="time" step={300} required value={time} onChange={(e) => setTime(e.target.value)} />
        </Field>
      </div>
      <Field label="Length" hint={pupil ? `${pupil.name.split(" ")[0]}'s usual length is ${pupil.minutes} minutes.` : undefined}>
        <Select name="minutes" value={String(minutes)} onChange={(e) => setMinutes(Number(e.target.value))}>
          {lengths.map((m) => (
            <option key={m} value={m}>
              {m} minutes
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Repeats">
        <Select name="repeat" value={repeat} onChange={(e) => setRepeat(e.target.value)}>
          <option value="once">Just this once</option>
          <option value="weekly">Every week from this date</option>
          {everyOtherWeek && <option value="every2">Every other week from this date</option>}
        </Select>
      </Field>

      <section className="flex flex-col gap-1">
        <h2 className="text-[17px] font-semibold">{date ? dayName(date) : "That day"}</h2>
        {start !== null && (
          <p className={cx("text-[16px] font-medium", clashes.length ? "text-danger" : "text-sage")}>
            {clashes.length
              ? `Overlaps ${clashes.map((c) => `${c.name.split(" ")[0]} (${formatTime(c.time)}–${formatTime(endTime(c.time, c.minutes))})`).join(", ")}`
              : `${formatTime(time)} to ${formatTime(endTime(time, minutes))} is free.`}
          </p>
        )}
        {sameDay.length === 0 ? (
          <p className="text-[15px] text-muted">Nothing booked yet.</p>
        ) : (
          <ul className="flex flex-col text-[15px]">
            {sameDay.map((b) => (
              <li key={`${b.time}-${b.name}`} className="flex gap-3">
                <span className="w-[8.5rem] shrink-0 tabular-nums text-muted">
                  {formatTime(b.time)}–{formatTime(endTime(b.time, b.minutes))}
                </span>
                <span>{b.name}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Button type="submit" className="mt-1">
        Add lesson
      </Button>
    </form>
  );
}
