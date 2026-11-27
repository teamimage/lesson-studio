"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setGuestTeacher } from "@/app/lessons/actions";
import { Button, Input } from "@/components/ui";
import { GUEST_MAX } from "@/lib/guest";

/**
 * One plain line on the lesson page: who taught it when it wasn't the
 * regular teacher. Tap to type a guest's name, or to change or remove it.
 */
export function GuestTeacher({ lessonId, guest }: { lessonId: string; guest: string | null }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(guest ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function save(value: string) {
    setError(null);
    start(async () => {
      const out = await setGuestTeacher(lessonId, value);
      if ("error" in out) {
        setError(out.error);
        return;
      }
      setName(out.guest ?? "");
      setEditing(false);
      router.refresh();
    });
  }

  if (!editing)
    return (
      <p className="m-0 px-1 text-[16px]">
        {guest ? (
          <>
            <span className="text-muted">Guest instructor: </span>
            <span className="font-medium">{guest}</span>{" "}
            <button type="button" onClick={() => setEditing(true)} className="text-sm text-accent-ink underline">
              Change
            </button>
          </>
        ) : (
          <button type="button" onClick={() => setEditing(true)} className="text-sm text-accent-ink underline">
            + Guest instructor
          </button>
        )}
      </p>
    );

  return (
    <form
      className="flex flex-col gap-2 px-1"
      onSubmit={(e) => {
        e.preventDefault();
        save(name);
      }}
    >
      <label htmlFor={`guest-${lessonId}`} className="text-[15px] font-medium">
        Guest instructor for this lesson
      </label>
      <Input
        id={`guest-${lessonId}`}
        value={name}
        maxLength={GUEST_MAX}
        autoFocus
        autoComplete="off"
        placeholder="Their name"
        onChange={(e) => setName(e.target.value)}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending || !name.trim()}>
          {pending ? "Saving…" : "Save"}
        </Button>
        {guest && (
          <button type="button" disabled={pending} onClick={() => save("")} className="text-sm text-danger underline">
            Remove guest
          </button>
        )}
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setName(guest ?? "");
            setError(null);
            setEditing(false);
          }}
          className="text-sm text-muted underline"
        >
          Cancel
        </button>
      </div>
      {error && <p className="m-0 text-sm text-danger">{error}</p>}
    </form>
  );
}
