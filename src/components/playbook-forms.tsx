"use client";

import { useActionState } from "react";
import { Button, Textarea } from "@/components/ui";
import { answerCard, readMyLessons } from "@/app/settings/playbook-actions";

// Keep / Edit / Not me on a playbook card. Editing is simply changing the
// words before pressing Keep.

export function CardAnswer({ id, body, kept = false }: { id: string; body: string; kept?: boolean }) {
  const [state, action, pending] = useActionState(answerCard, null);
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="id" value={id} />
      <Textarea name="body" defaultValue={body} maxLength={400} rows={2} aria-label="The card, in your words" />
      {state?.error && <p className="text-sm text-danger">{state.error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button name="what" value="keep" variant={kept ? "secondary" : "sage"} disabled={pending}>
          {kept ? "Save wording" : "Keep"}
        </Button>
        <Button name="what" value="not_me" variant="secondary" disabled={pending}>
          {kept ? "Remove" : "Not me"}
        </Button>
      </div>
    </form>
  );
}

export function ReadLessonsButton({ label }: { label: string }) {
  const [state, action, pending] = useActionState(readMyLessons, null);
  return (
    <form action={action} className="flex flex-col gap-1.5">
      <Button variant="secondary" disabled={pending} className="self-start">
        {pending ? "Reading your lessons… about a minute" : label}
      </Button>
      {state?.error && <p className="text-sm text-danger">{state.error}</p>}
      {state?.note && <p className="text-sm text-muted">{state.note}</p>}
    </form>
  );
}
