"use client";

import { useState, useTransition } from "react";
import type { AssignmentInput, LessonInput, PieceInput } from "@/app/lessons/actions";
import { Button, Field, Input, Select, Textarea, cx, inputClass } from "@/components/ui";
import { ASSIGNMENT_KINDS, PIECE_ACTIVITIES } from "@/lib/constants";
import type { Enums } from "@/lib/supabase/types";

type Props = {
  studentId: string;
  studentName: string;
  lessonId?: string;
  initial: Omit<LessonInput, "student_id">;
  /** Titles the teacher has used before, for quick picking. */
  knownPieces: string[];
  /** Assignments from the previous approved lesson, for "carry forward". */
  previousAssignments: AssignmentInput[];
  action: (fd: FormData) => Promise<void>;
  isApproved?: boolean;
};

const emptyPiece: PieceInput = { title: "", activity: "worked_on", notes: "" };
const emptyAssignment: AssignmentInput = { kind: "piece", title: "", how: "", every_day: true };

export function LessonForm({
  studentId,
  studentName,
  lessonId,
  initial,
  knownPieces,
  previousAssignments,
  action,
  isApproved,
}: Props) {
  const [basics, setBasics] = useState({
    lesson_date: initial.lesson_date,
    duration_minutes: initial.duration_minutes?.toString() ?? "",
    next_lesson_date: initial.next_lesson_date ?? "",
    summary: initial.summary,
    focus_points: initial.focus_points,
    suggestions: initial.suggestions,
    teacher_notes: initial.teacher_notes,
    parent_message: initial.parent_message,
  });
  const [pieces, setPieces] = useState<PieceInput[]>(initial.pieces.length ? initial.pieces : [{ ...emptyPiece }]);
  const [assignments, setAssignments] = useState<AssignmentInput[]>(
    initial.assignments.length ? initial.assignments : [{ ...emptyAssignment }],
  );
  const [pending, start] = useTransition();

  const payload: LessonInput = {
    student_id: studentId,
    lesson_date: basics.lesson_date,
    duration_minutes: basics.duration_minutes ? Number(basics.duration_minutes) : null,
    next_lesson_date: basics.next_lesson_date || null,
    summary: basics.summary,
    focus_points: basics.focus_points,
    suggestions: basics.suggestions,
    teacher_notes: basics.teacher_notes,
    parent_message: basics.parent_message,
    pieces,
    assignments,
  };

  function set<K extends keyof typeof basics>(key: K, value: string) {
    setBasics((b) => ({ ...b, [key]: value }));
  }
  function updatePiece(i: number, patch: Partial<PieceInput>) {
    setPieces((ps) => ps.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  }
  function updateAssignment(i: number, patch: Partial<AssignmentInput>) {
    setAssignments((as) => as.map((a, j) => (j === i ? { ...a, ...patch } : a)));
  }
  function addPieceAsAssignment(p: PieceInput) {
    if (!p.title) return;
    setAssignments((as) => {
      const filled = as.filter((a) => a.title);
      return [...filled, { kind: p.activity === "reviewed" ? "review" : "piece", title: p.title, how: "", every_day: true }];
    });
  }
  function carryForward() {
    setAssignments((as) => {
      const filled = as.filter((a) => a.title);
      const titles = new Set(filled.map((a) => a.title.toLowerCase()));
      return [...filled, ...previousAssignments.filter((a) => !titles.has(a.title.toLowerCase()))];
    });
  }

  function submit(intent: "draft" | "approve" | "update") {
    const fd = new FormData();
    fd.set("payload", JSON.stringify(payload));
    fd.set("intent", intent);
    if (lessonId) fd.set("lesson_id", lessonId);
    start(() => action(fd));
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit(isApproved ? "update" : "draft");
      }}
      className="flex flex-col gap-7"
    >
      <datalist id="known-pieces">
        {knownPieces.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>

      <Section title="Lesson">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date">
            <Input type="date" value={basics.lesson_date} onChange={(e) => set("lesson_date", e.target.value)} required />
          </Field>
          <Field label="Minutes">
            <Input
              type="number"
              inputMode="numeric"
              min={5}
              max={180}
              value={basics.duration_minutes}
              onChange={(e) => set("duration_minutes", e.target.value)}
              placeholder="30"
            />
          </Field>
        </div>
        <Field label="Next lesson">
          <Input type="date" value={basics.next_lesson_date} onChange={(e) => set("next_lesson_date", e.target.value)} />
        </Field>
      </Section>

      <Section
        title="Pieces and skills worked on"
        hint="Each piece you name here goes on the student's repertoire list when you approve."
      >
        <div className="flex flex-col gap-3">
          {pieces.map((p, i) => (
            <div key={i} className="flex flex-col gap-2 rounded-2xl border border-rule bg-sheet p-3">
              <div className="flex gap-2">
                <input
                  className={cx(inputClass, "flex-1")}
                  list="known-pieces"
                  placeholder="Piece or skill"
                  value={p.title}
                  onChange={(e) => updatePiece(i, { title: e.target.value })}
                />
                <Select
                  className="w-[9.5rem] shrink-0"
                  value={p.activity}
                  onChange={(e) => updatePiece(i, { activity: e.target.value as Enums<"piece_activity"> })}
                >
                  {PIECE_ACTIVITIES.map((a) => (
                    <option key={a.value} value={a.value}>
                      {a.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="flex gap-2">
                <input
                  className={cx(inputClass, "flex-1")}
                  placeholder="Note (optional)"
                  value={p.notes}
                  onChange={(e) => updatePiece(i, { notes: e.target.value })}
                />
                <button
                  type="button"
                  onClick={() => addPieceAsAssignment(p)}
                  className="min-h-11 shrink-0 rounded-xl px-3 text-sm font-medium text-accent-ink hover:bg-accent-soft"
                  title="Add as a practice assignment"
                >
                  → Assign
                </button>
                <RemoveButton onClick={() => setPieces((ps) => ps.filter((_, j) => j !== i))} />
              </div>
            </div>
          ))}
          <AddButton onClick={() => setPieces((ps) => [...ps, { ...emptyPiece }])}>Add a piece</AddButton>
        </div>
      </Section>

      <Section title="Today we…" hint="Written for the parent. Two or three plain sentences.">
        <Textarea
          value={basics.summary}
          onChange={(e) => set("summary", e.target.value)}
          rows={3}
          placeholder={`Reviewed Twinkle with a round hand. Started line 1 of …`}
        />
      </Section>

      <Section title="Focus point" hint="The one or two things that matter this week, in words a parent can repeat.">
        <Textarea
          value={basics.focus_points}
          onChange={(e) => set("focus_points", e.target.value)}
          rows={2}
          placeholder="Keep the pinky curved on string crossings. Slow and relaxed beats fast and tight."
        />
      </Section>

      <Section
        title="Practice assignments"
        hint="What to practice at home, and how. Parents tick these off each day."
        action={
          previousAssignments.length > 0 ? (
            <button type="button" onClick={carryForward} className="text-sm font-medium text-accent-ink underline">
              Copy last week&apos;s
            </button>
          ) : undefined
        }
      >
        <div className="flex flex-col gap-3">
          {assignments.map((a, i) => (
            <div key={i} className="flex flex-col gap-2 rounded-2xl border border-rule bg-sheet p-3">
              <div className="flex gap-2">
                <Select
                  className="w-[7.5rem] shrink-0"
                  value={a.kind}
                  onChange={(e) => updateAssignment(i, { kind: e.target.value as Enums<"assignment_kind"> })}
                >
                  {ASSIGNMENT_KINDS.map((k) => (
                    <option key={k.value} value={k.value}>
                      {k.label}
                    </option>
                  ))}
                </Select>
                <input
                  className={cx(inputClass, "flex-1")}
                  list={a.kind === "piece" || a.kind === "review" ? "known-pieces" : undefined}
                  placeholder="What"
                  value={a.title}
                  onChange={(e) => updateAssignment(i, { title: e.target.value })}
                />
              </div>
              <div className="flex gap-2">
                <input
                  className={cx(inputClass, "flex-1")}
                  placeholder="How much and how (three slow times, pinky curved)"
                  value={a.how}
                  onChange={(e) => updateAssignment(i, { how: e.target.value })}
                />
                <RemoveButton onClick={() => setAssignments((as) => as.filter((_, j) => j !== i))} />
              </div>
              <label className="flex items-center gap-2 text-sm text-muted">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[var(--accent)]"
                  checked={a.every_day}
                  onChange={(e) => updateAssignment(i, { every_day: e.target.checked })}
                />
                Every day
              </label>
            </div>
          ))}
          <AddButton onClick={() => setAssignments((as) => [...as, { ...emptyAssignment }])}>Add an assignment</AddButton>
        </div>
      </Section>

      <Section title="Note to the parent" hint="One encouraging line for the lesson sheet.">
        <Input
          value={basics.parent_message}
          onChange={(e) => set("parent_message", e.target.value)}
          placeholder="Praise every steady crossing. Stop before frustration."
        />
      </Section>

      <Section title="For next lesson" hint="Suggestions for yourself. Parents don't see this.">
        <Textarea
          value={basics.suggestions}
          onChange={(e) => set("suggestions", e.target.value)}
          rows={2}
          placeholder="Check the bow hold first. If stable, add line 2."
        />
      </Section>

      <Section title="Private notes" hint="Never shown to parents.">
        <Textarea value={basics.teacher_notes} onChange={(e) => set("teacher_notes", e.target.value)} rows={2} />
      </Section>

      <div className="sticky bottom-[calc(3.5rem+env(safe-area-inset-bottom))] -mx-4 flex gap-2 border-t border-rule bg-paper/95 px-4 py-3 backdrop-blur">
        {isApproved ? (
          <Button type="submit" disabled={pending} className="flex-1">
            {pending ? "Saving…" : "Save changes"}
          </Button>
        ) : (
          <>
            <Button type="button" variant="secondary" disabled={pending} onClick={() => submit("draft")} className="flex-1">
              {pending ? "Saving…" : "Save draft"}
            </Button>
            <Button type="button" variant="sage" disabled={pending} onClick={() => submit("approve")} className="flex-1">
              {pending ? "Saving…" : `Approve for ${studentName.split(" ")[0]}'s family`}
            </Button>
          </>
        )}
      </div>
    </form>
  );
}

function Section({
  title,
  hint,
  action,
  children,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-semibold">{title}</h2>
        {action}
      </div>
      {hint && <p className="-mt-1 text-xs text-muted">{hint}</p>}
      {children}
    </section>
  );
}

function AddButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="min-h-11 rounded-xl border border-dashed border-rule text-sm font-medium text-accent-ink hover:bg-accent-soft"
    >
      + {children}
    </button>
  );
}

function RemoveButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Remove"
      className="min-h-11 w-10 shrink-0 rounded-xl text-muted hover:bg-danger-soft hover:text-danger"
    >
      ✕
    </button>
  );
}
