"use client";

import { useState } from "react";
import { addLesson } from "@/app/lessons/live-actions";
import { Button, Field, Input } from "@/components/ui";

// Dates in the teacher's own time zone (the server runs on UTC).
function localISO(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** "Add lesson": pick a date (yesterday by default) and open that lesson to upload its video and write notes. */
export function AddLesson({ studentId }: { studentId: string }) {
  const [open, setOpen] = useState(false);
  const [today, setToday] = useState("");
  const [date, setDate] = useState("");

  if (!open) {
    return (
      <Button
        type="button"
        variant="secondary"
        className="w-full"
        onClick={() => {
          setToday(localISO());
          setDate(localISO(-1));
          setOpen(true);
        }}
      >
        Add lesson
      </Button>
    );
  }

  return (
    <form action={addLesson} className="flex flex-col gap-3 rounded-2xl border border-rule bg-sheet p-4">
      <input type="hidden" name="student_id" value={studentId} />
      <input type="hidden" name="local_today" value={today} />
      <Field label="Lesson date" hint="For a lesson that already happened. You can upload its video and add notes next.">
        <Input type="date" name="lesson_date" value={date} max={today} onChange={(e) => setDate(e.target.value)} required />
      </Field>
      <div className="flex gap-2">
        <Button className="flex-1">Add lesson</Button>
        <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
