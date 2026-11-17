"use client";

import { type ReactNode, useActionState, useId, useState } from "react";
import { Button, Input, Textarea } from "@/components/ui";
import { acceptFocus, addFocus, editFocus, suggestFocus, type FocusActionState } from "@/app/students/focus-actions";

// The small forms on the teacher's "What we're working on" card.

function Problem({ state }: { state: FocusActionState }) {
  if (!state?.error && !state?.note) return null;
  return <p className={state.error ? "text-sm text-danger" : "text-sm text-muted"}>{state.error ?? state.note}</p>;
}

/**
 * A suggestion, shown in full as plain text so it can be read on a phone.
 * "Change the words" swaps the text for fields that wrap; Accept saves
 * whichever is showing. `children` is the "Not this" button, on the same row.
 */
export function AcceptFocusForm({
  id,
  studentId,
  title,
  cue,
  children,
}: {
  id: string;
  studentId: string;
  title: string;
  cue: string;
  children?: ReactNode;
}) {
  const [state, action, pending] = useActionState(acceptFocus, null);
  const [editing, setEditing] = useState(false);
  const formId = useId();
  return (
    <div className="flex min-w-0 flex-col gap-2">
      {editing ? (
        <>
          <Textarea form={formId} name="title" defaultValue={title} maxLength={120} rows={2} aria-label="Focus point" />
          <Textarea
            form={formId}
            name="parent_cue"
            defaultValue={cue}
            maxLength={240}
            rows={3}
            placeholder="For the parent: what to listen for (optional)"
            aria-label="Line for the parent"
          />
        </>
      ) : (
        <div>
          <p className="text-[17px] font-medium">{title}</p>
          {cue && (
            <p className="mt-0.5 text-[16px]">
              <span className="font-semibold text-plum">Parent: </span>
              {cue}
            </p>
          )}
        </div>
      )}
      <Problem state={state} />
      <div className="flex flex-wrap items-center gap-2">
        <form id={formId} action={action}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="student_id" value={studentId} />
          <Button variant="sage" disabled={pending}>
            {pending ? "Saving…" : "Accept"}
          </Button>
        </form>
        {!editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="min-h-10 rounded-full border border-rule bg-sheet px-3 text-sm font-medium hover:border-accent/50"
          >
            Change the words
          </button>
        )}
        {children}
      </div>
    </div>
  );
}

export function EditFocusForm({ id, studentId, title, cue }: { id: string; studentId: string; title: string; cue: string }) {
  const [state, action, pending] = useActionState(editFocus, null);
  return (
    <form action={action} className="flex flex-col gap-1.5">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="student_id" value={studentId} />
      <Input name="title" defaultValue={title} maxLength={120} aria-label="Focus point" />
      <Input name="parent_cue" defaultValue={cue} maxLength={240} placeholder="For the parent: what to listen for" aria-label="Line for the parent" />
      <Problem state={state} />
      <Button variant="secondary" disabled={pending} className="self-start">
        {pending ? "Saving…" : "Save wording"}
      </Button>
    </form>
  );
}

export function AddFocusForm({ studentId }: { studentId: string }) {
  const [state, action, pending] = useActionState(addFocus, null);
  return (
    <form action={action} className="flex flex-col gap-1.5">
      <input type="hidden" name="student_id" value={studentId} />
      <Input name="title" maxLength={120} placeholder="In your words, e.g. Let the arm's weight make the sound" aria-label="Focus point" />
      <Input name="parent_cue" maxLength={240} placeholder="For the parent: what to listen for (optional)" aria-label="Line for the parent" />
      <Problem state={state} />
      <Button variant="secondary" disabled={pending} className="self-start">
        {pending ? "Saving…" : "Add to the list"}
      </Button>
    </form>
  );
}

export function SuggestFocusForm({ studentId, label }: { studentId: string; label: string }) {
  const [state, action, pending] = useActionState(suggestFocus, null);
  return (
    <form action={action} className="flex flex-col gap-1.5">
      <input type="hidden" name="student_id" value={studentId} />
      <Button variant="secondary" disabled={pending} className="self-start">
        {pending ? "Reading the lesson…" : label}
      </Button>
      <Problem state={state} />
    </form>
  );
}
