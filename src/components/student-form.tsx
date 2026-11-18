import Link from "next/link";
import { Button, Field, Input, Select, Textarea } from "@/components/ui";
import { InstrumentBookFields } from "@/components/instrument-book-fields";
import { PhotoField } from "@/components/photo-field";
import { studentPhotoSrc } from "@/lib/constants";
import type { Student } from "@/lib/data";

export const LENGTHS = [15, 20, 30, 45, 60, 75, 90];

export function StudentForm({
  student,
  action,
  submitLabel,
  withParent,
  lengthReady,
  defaultMinutes,
}: {
  student?: Student;
  action: (fd: FormData) => Promise<void>;
  submitLabel: string;
  withParent?: boolean;
  /** True once student-lesson-length.sql has run (the usual length is saved on the student). */
  lengthReady?: boolean;
  /** The usual length to show: the student's own, else their regular lesson's, else 30. */
  defaultMinutes?: number;
}) {
  const usual = student?.lesson_minutes ?? defaultMinutes ?? 30;
  return (
    <form action={action} className="flex flex-col gap-4">
      {student && <input type="hidden" name="id" value={student.id} />}
      <PhotoField name={student?.name} instrument={student?.instrument} photoSrc={student ? studentPhotoSrc(student) : null} />
      <Field label="Name">
        <Input name="name" required defaultValue={student?.name ?? ""} autoComplete="off" placeholder="First name" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <InstrumentBookFields instrument={student?.instrument} currentBook={student?.current_book} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Age">
          <Input name="age" type="number" inputMode="numeric" min={2} max={99} defaultValue={student?.age ?? ""} />
        </Field>
        <Field label="Method">
          <Input name="method" defaultValue={student?.method ?? "Suzuki"} />
        </Field>
      </div>
      {student ? (
        <>
          {/* Lesson times live in Settings → Lesson times now; keep the old fields as they were. */}
          <input type="hidden" name="lesson_day" value={student.lesson_day ?? ""} />
          <input type="hidden" name="lesson_time" value={student.lesson_time ?? ""} />
          <p className="text-[15px] text-muted">
            Lesson day and time:{" "}
            <Link href="/settings/lesson-times" className="font-medium text-accent-ink">
              Settings → Lesson times ›
            </Link>
          </p>
        </>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Lesson day">
            <Input name="lesson_day" placeholder="Tuesday" />
          </Field>
          <Field label="Lesson time">
            <Input name="lesson_time" placeholder="4:30 PM" />
          </Field>
        </div>
      )}
      {lengthReady && (
        <Field label="Usual lesson length" hint="Add lesson uses this length and blocks that much time.">
          <Select name="lesson_minutes" defaultValue={String(usual)}>
            {LENGTHS.includes(usual) ? null : <option value={usual}>{usual} minutes</option>}
            {LENGTHS.map((m) => (
              <option key={m} value={m}>
                {m} minutes
              </option>
            ))}
          </Select>
        </Field>
      )}
      <Field label="Goals" hint="Shown to the parent.">
        <Textarea name="goals" defaultValue={student?.goals ?? ""} rows={2} />
      </Field>
      <Field label="Private notes" hint="Only you see these.">
        <Textarea name="notes" defaultValue={student?.notes ?? ""} rows={2} />
      </Field>
      {student && (
        <label className="flex items-center gap-3 text-[16px]">
          <input type="hidden" name="active" value="off" />
          <input
            type="checkbox"
            name="active"
            value="on"
            defaultChecked={student.active}
            className="h-5 w-5 accent-[var(--accent)]"
          />
          Active student
        </label>
      )}
      {withParent && (
        <fieldset className="mt-2 flex flex-col gap-3 rounded-2xl border border-rule p-4">
          <legend className="px-1 text-sm font-semibold">Parent (optional)</legend>
          <p className="-mt-1 text-xs text-muted">
            When this parent signs in with this email, they see the home practice plan for this student.
          </p>
          <Field label="Parent name">
            <Input name="parent_name" />
          </Field>
          <Field label="Parent email">
            <Input name="parent_email" type="email" autoComplete="off" />
          </Field>
        </fieldset>
      )}
      <Button type="submit" className="mt-2">
        {submitLabel}
      </Button>
    </form>
  );
}
