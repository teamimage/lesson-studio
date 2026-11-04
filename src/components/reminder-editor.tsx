import { Button, Card, Input, Notice, Pill, Select } from "@/components/ui";
import { addReminder, clearReminder, dismissReminder, saveReminder } from "@/app/students/reminder-actions";
import { kindLabel, type Reminder, type StudentReminders } from "@/lib/reminders";

// Teacher's editor for a student's standing technique and posture reminders.
// Shown on the student page and the lesson page. AI suggestions from a lesson
// draft wait here until the teacher keeps or dismisses them.
export function ReminderEditor({
  studentId,
  reminders,
  back,
  lessonId,
}: {
  studentId: string;
  reminders: StudentReminders;
  /** Where to return after a change, e.g. "/lessons/<id>#reminders". */
  back: string;
  lessonId?: string;
}) {
  if (!reminders.ready) {
    return (
      <Notice>
        Technique and posture reminders need one database step: run student-reminders.sql in the Supabase SQL Editor.
      </Notice>
    );
  }
  const hidden = (r?: Reminder) => (
    <>
      {r && <input type="hidden" name="id" value={r.id} />}
      <input type="hidden" name="student_id" value={studentId} />
      <input type="hidden" name="back" value={back} />
      {lessonId && <input type="hidden" name="lesson_id" value={lessonId} />}
    </>
  );
  const kindSelect = (value: string) => (
    <Select name="kind" defaultValue={value} className="min-h-10 w-auto py-1 text-[15px]" aria-label="Kind">
      <option value="posture">Posture</option>
      <option value="technique">Technique</option>
    </Select>
  );

  return (
    <div className="flex flex-col gap-3">
      {reminders.suggested.length > 0 && (
        <Card tone="amber" className="flex flex-col gap-3">
          <div className="text-sm">
            <span className="font-semibold">Suggested from the lesson.</span> The family sees these only after you keep
            them. Edit the words first if you like.
          </div>
          {reminders.suggested.map((r) => (
            <form key={r.id} action={saveReminder} className="flex flex-col gap-2 sm:flex-row sm:items-center">
              {hidden(r)}
              {kindSelect(r.kind)}
              <Input name="text" defaultValue={r.text} maxLength={240} className="min-h-10 flex-1 py-1 text-[15px]" />
              <div className="flex gap-2">
                <Button variant="sage" className="min-h-10 px-3 text-sm">
                  Keep
                </Button>
                <Button formAction={dismissReminder} variant="secondary" className="min-h-10 px-3 text-sm">
                  Dismiss
                </Button>
              </div>
            </form>
          ))}
        </Card>
      )}

      {reminders.active.length === 0 ? (
        <p className="text-sm text-muted">
          None yet. Reminders stay on Home practice and the lesson sheet from lesson to lesson until you clear them.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-rule rounded-2xl border border-rule bg-sheet">
          {reminders.active.map((r) => (
            <li key={r.id} className="px-3 py-2">
              <details className="group">
                <summary className="flex cursor-pointer list-none items-baseline gap-2 [&::-webkit-details-marker]:hidden">
                  <Pill tone={r.kind === "posture" ? "plum" : "accent"}>{kindLabel(r.kind)}</Pill>
                  <span className="flex-1">{r.text}</span>
                  <span className="text-sm text-accent-ink group-open:hidden">Edit</span>
                </summary>
                <form action={saveReminder} className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                  {hidden(r)}
                  {kindSelect(r.kind)}
                  <Input name="text" defaultValue={r.text} maxLength={240} className="min-h-10 flex-1 py-1 text-[15px]" />
                  <div className="flex gap-2">
                    <Button className="min-h-10 px-3 text-sm">Save</Button>
                    <Button formAction={clearReminder} variant="secondary" className="min-h-10 px-3 text-sm">
                      Clear
                    </Button>
                  </div>
                </form>
              </details>
            </li>
          ))}
        </ul>
      )}

      <form action={addReminder} className="flex flex-col gap-2 sm:flex-row sm:items-center">
        {hidden()}
        {kindSelect("posture")}
        <Input
          name="text"
          required
          maxLength={240}
          placeholder="e.g. Bent thumb on the bow"
          className="min-h-10 flex-1 py-1 text-[15px]"
        />
        <Button variant="secondary" className="min-h-10 px-3 text-sm">
          Add reminder
        </Button>
      </form>
    </div>
  );
}

/** The family's read-only list: a small tag and the words. */
export function ReminderList({ reminders, large = false }: { reminders: Reminder[]; large?: boolean }) {
  return (
    <ul className={large ? "flex flex-col gap-2 text-[19px]" : "flex flex-col gap-1.5"}>
      {reminders.map((r) => (
        <li key={r.id} className="flex items-baseline gap-2">
          <Pill tone={r.kind === "posture" ? "plum" : "accent"} className="shrink-0">
            {kindLabel(r.kind)}
          </Pill>
          <span>{r.text}</span>
        </li>
      ))}
    </ul>
  );
}
