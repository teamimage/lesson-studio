"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Input, Textarea, cx } from "@/components/ui";
import { savePracticeDay } from "@/app/family/actions";
import { unlockPracticeEdit } from "@/app/family/pin-actions";

export type EditorItem = {
  id: string;
  title: string;
  /** A recording that day heard it. */
  heard: boolean;
  /** Not on the list for that day (an older list); shown only while ticked. */
  offList?: boolean;
};

// The practice day page's record of what was done, open to change by the
// family or the teacher: tick off work the recording missed (it started
// late, or nothing was recorded), fix the minutes, listening and note.
// Ticks a recording heard say so; the rest read "ticked by hand".
export function PracticeDayEditor({
  studentId,
  date,
  items,
  initial,
  recorded,
  canRegrade = false,
  pinRequired = false,
  familyMode = false,
  startEditing = false,
}: {
  /** Open straight into editing (Add practice from the calendar). */
  startEditing?: boolean;
  /** A parent PIN is set and this viewer needs it to change the record. */
  pinRequired?: boolean;
  /** Opened from Family mode: sent with the save so the server asks for the PIN too. */
  familyMode?: boolean;
  /** The teacher can press Review again to grade with the new ticks. */
  canRegrade?: boolean;
  studentId: string;
  date: string;
  items: EditorItem[];
  initial: { done: string[]; minutes: number | null; listened: boolean; note: string };
  /** Some session that day has a review, so a grade may want redoing. */
  recorded: boolean;
}) {
  const router = useRouter();
  const [done, setDone] = useState(() => new Set(initial.done));
  const [minutes, setMinutes] = useState(initial.minutes == null ? "" : String(initial.minutes));
  const [listened, setListened] = useState(initial.listened);
  const [note, setNote] = useState(initial.note);
  const [saved, setSaved] = useState(initial);
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const [asking, setAsking] = useState(false);
  const [pin, setPin] = useState("");
  const [unlocked, setUnlocked] = useState<string | null>(null);
  const [pinError, setPinError] = useState<string | null>(null);

  function startEdit() {
    setMsg(null);
    if (pinRequired && unlocked === null) {
      setAsking(true);
      return;
    }
    setEditing(true);
  }

  const opened = useRef(false);
  useEffect(() => {
    if (!startEditing || opened.current) return;
    opened.current = true;
    startEdit();
    // Only on first load, when asked to open ready to edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startEditing]);

  function unlock() {
    setPinError(null);
    start(async () => {
      const res = await unlockPracticeEdit(studentId, pin);
      if (!res.ok) {
        setPinError(res.error);
        return;
      }
      setUnlocked(pin);
      setPin("");
      setAsking(false);
      setEditing(true);
    });
  }

  const changed = useMemo(() => {
    const a = [...done].sort().join();
    const b = [...saved.done].sort().join();
    const m = minutes.trim() === "" ? null : Number(minutes);
    return a !== b || m !== saved.minutes || listened !== saved.listened || note.trim() !== saved.note.trim();
  }, [done, minutes, listened, note, saved]);

  function toggle(id: string) {
    setMsg(null);
    setDone((d) => {
      const next = new Set(d);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function save() {
    const m = minutes.trim() === "" ? null : Number(minutes);
    const next = { done: [...done], minutes: m, listened, note };
    const handAdded = next.done.some((id) => !saved.done.includes(id) && !items.find((i) => i.id === id)?.heard);
    start(async () => {
      const res = await savePracticeDay({ studentId, date, ...next, pin: unlocked ?? "", familyMode });
      if (!res.ok) {
        setMsg({ tone: "error", text: res.error });
        return;
      }
      setSaved(next);
      setEditing(false);
      setMsg({
        tone: "ok",
        text:
          recorded && handAdded && canRegrade
            ? "Saved. The grade was written before these ticks; press Review again on the recording below to grade it with them."
            : "Saved.",
      });
      router.refresh();
    });
  }

  function cancel() {
    setDone(new Set(saved.done));
    setMinutes(saved.minutes == null ? "" : String(saved.minutes));
    setListened(saved.listened);
    setNote(saved.note);
    setEditing(false);
  }

  const shown = items.filter((i) => !i.offList || done.has(i.id));
  const note_ = msg && (
    <p
      role="status"
      className={cx(
        "rounded-xl px-3 py-2 text-[16px]",
        msg.tone === "ok" ? "bg-sage-soft text-ink" : "bg-danger-soft text-danger",
      )}
    >
      {msg.text}
    </p>
  );

  if (!editing) {
    const savedSet = new Set(saved.done);
    const savedShown = items.filter((i) => !i.offList || savedSet.has(i.id));
    return (
      <div className="flex flex-col gap-4 text-[16px]">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-[20px] font-semibold">What was done</h2>
          <Button
            type="button"
            variant="secondary"
            className="min-h-11 shrink-0"
            onClick={startEdit}
          >
            {pinRequired && unlocked === null ? "🔒 Edit" : "Edit"}
          </Button>
        </div>
        {asking && (
          <div className="flex flex-col gap-2">
            <label className="text-[16px] font-medium" htmlFor="practice-pin">
              Parent PIN to change this record
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                id="practice-pin"
                type="password"
                inputMode="numeric"
                autoComplete="off"
                maxLength={8}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                onKeyDown={(e) => e.key === "Enter" && pin.length >= 4 && unlock()}
                className="w-36 text-center tracking-[0.3em]"
                autoFocus
              />
              <Button type="button" variant="plum" className="min-h-11" disabled={pin.length < 4 || pending} onClick={unlock}>
                {pending ? "Checking…" : "Unlock"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="min-h-11"
                onClick={() => {
                  setAsking(false);
                  setPin("");
                  setPinError(null);
                }}
              >
                Cancel
              </Button>
            </div>
            {pinError && <p className="text-sm text-danger">{pinError}</p>}
          </div>
        )}
        {note_}
        {savedShown.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {savedShown.map((it) => {
              const on = savedSet.has(it.id);
              return (
                <li key={it.id} className="flex items-start gap-3">
                  <span
                    className={cx(
                      "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-sm",
                      on ? "bg-sage text-white" : "border border-rule",
                    )}
                    aria-hidden
                  >
                    {on ? "✓" : ""}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={cx("block", on ? "font-medium" : "text-muted")}>{it.title}</span>
                    {on && (
                      <span className={cx("block text-sm", it.heard ? "text-sage" : "text-muted")}>
                        {it.heard ? "heard on the recording" : "ticked by hand"}
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-muted">There was no practice list for this day yet.</p>
        )}
        <div className="flex flex-col gap-1 text-[16px]">
          <span>
            <span className="text-muted">Minutes: </span>
            {saved.minutes ?? "not set"}
            {saved.listened && <span className="text-plum"> · listened to the recording</span>}
          </span>
          {saved.note.trim() && (
            <span>
              <span className="text-muted">Note for the teacher: </span>
              {saved.note}
            </span>
          )}
        </div>
        {recorded && <p className="text-sm text-muted">Started recording late? Press Edit to tick what was done before it started.</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 text-[16px]">
      {shown.length > 0 ? (
        <div className="flex flex-col gap-1">
          <h2 className="font-display text-[20px] font-semibold">What was done</h2>
          <p className="text-sm text-muted">
            {recorded
              ? "Started recording late? Tick what was done before it started."
              : "Tick what was done this day."}
          </p>
          <ul className="mt-1 flex flex-col">
            {shown.map((it) => {
              const on = done.has(it.id);
              return (
                <li key={it.id} className="border-b border-rule last:border-b-0">
                  <label className="flex min-h-14 cursor-pointer items-center gap-3 py-2">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => toggle(it.id)}
                      className="h-7 w-7 shrink-0 accent-[var(--sage)]"
                    />
                    <span className="min-w-0 flex-1">
                      <span className={cx("block", on ? "font-medium" : "text-muted")}>{it.title}</span>
                      {on && (
                        <span className={cx("block text-sm", it.heard ? "text-sage" : "text-muted")}>
                          {it.heard ? "heard on the recording" : "ticked by hand"}
                        </span>
                      )}
                      {!on && it.heard && <span className="block text-sm text-muted">heard on the recording, unticked</span>}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <p className="text-sm text-muted">There was no practice list for this day yet, so there&apos;s nothing to tick.</p>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Minutes">
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            max={600}
            value={minutes}
            onChange={(e) => {
              setMsg(null);
              setMinutes(e.target.value);
            }}
            placeholder="20"
          />
        </Field>
        <label className="flex items-end gap-3 pb-2.5">
          <input
            type="checkbox"
            checked={listened}
            onChange={(e) => {
              setMsg(null);
              setListened(e.target.checked);
            }}
            className="h-6 w-6 accent-[var(--plum)]"
          />
          Listened to the recording
        </label>
      </div>
      <Field label="Note for the teacher">
        <Textarea
          rows={2}
          value={note}
          onChange={(e) => {
            setMsg(null);
            setNote(e.target.value);
          }}
        />
      </Field>

      {note_}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="plum" disabled={!changed || pending} onClick={save} className="min-h-12 disabled:opacity-50">
          {pending ? "Saving…" : "Save"}
        </Button>
        <Button type="button" variant="secondary" disabled={pending} onClick={cancel} className="min-h-12">
          Cancel
        </Button>
      </div>
    </div>
  );
}
