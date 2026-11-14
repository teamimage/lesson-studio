"use client";

import { useActionState } from "react";
import { Button, Input } from "@/components/ui";
import { acceptFocus, addFocus, editFocus, suggestFocus, type FocusActionState } from "@/app/students/focus-actions";

// The small forms on the teacher's "What we're working on" card.

function Problem({ state }: { state: FocusActionState }) {
  if (!state?.error && !state?.note) return null;
  return <p className={state.error ? "text-sm text-danger" : "text-sm text-muted"}>{state.error ?? state.note}</p>;
}

/** A suggestion: the wording can be changed before it is accepted. */
export function AcceptFocusForm({ id, studentId, title, cue }: { id: string; studentId: string; title: string; cue: string }) {
  const [state, action, pending] = useActionState(acceptFocus, null);
  return (
    <form action={action} className="flex min-w-0 flex-1 flex-col gap-1.5">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="student_id" value={studentId} />
      <Input name="title" defaultValue={title} maxLength={120} aria-label="Focus point" />
      <Input name="parent_cue" defaultValue={cue} maxLength={240} placeholder="For the parent: what to listen for (optional)" aria-label="Line for the parent" />
      <Problem state={state} />
      <Button variant="sage" disabled={pending} className="self-start">
        {pending ? "Saving…" : "Accept"}
      </Button>
    </form>
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
