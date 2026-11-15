"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, cx } from "@/components/ui";
import { savePracticePin } from "@/app/family/pin-actions";

// Parent PIN for one student: while it is set, changing a practice record
// (ticks, minutes, note on a practice day) needs the PIN, so a child can't
// tick work off themselves. A parent gives the current PIN to change or
// remove it; the teacher can always set or remove it (the reset for a
// forgotten PIN).
export function PracticePinSetting({
  studentId,
  name,
  isSet,
  teacher = false,
}: {
  studentId: string;
  /** The student's first name, when the page lists more than one child. */
  name?: string;
  isSet: boolean;
  teacher?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [current, setCurrent] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const needCurrent = isSet && !teacher;
  const digits = (v: string) => v.replace(/\D/g, "").slice(0, 8);

  function run(newPin: string) {
    setMsg(null);
    start(async () => {
      const res = await savePracticePin(studentId, newPin, current);
      if (!res.ok) {
        setMsg({ ok: false, text: res.error });
        return;
      }
      setMsg({ ok: true, text: newPin ? "PIN saved. Changing a practice record now asks for it." : "PIN removed. Anyone in the family can change practice records." });
      setOpen(false);
      setPin("");
      setCurrent("");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2 text-[16px]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="font-medium">Parent PIN{name ? ` for ${name}` : ""}</div>
          <div className="text-sm text-muted">
            {isSet ? "Set. Changing a practice record asks for it." : "Not set. Anyone in the family can change practice records."}
          </div>
        </div>
        {!open && (
          <Button type="button" variant="secondary" className="min-h-11" onClick={() => { setMsg(null); setOpen(true); }}>
            {isSet ? "Change" : "Set a PIN"}
          </Button>
        )}
      </div>
      {open && (
        <div className="flex flex-col gap-2">
          {needCurrent && (
            <label className="flex flex-col gap-1">
              <span className="text-sm text-muted">Current PIN</span>
              <Input type="password" inputMode="numeric" autoComplete="off" value={current} onChange={(e) => setCurrent(digits(e.target.value))} className="w-40 tracking-[0.3em]" />
            </label>
          )}
          <label className="flex flex-col gap-1">
            <span className="text-sm text-muted">New PIN, 4 to 8 digits</span>
            <Input type="password" inputMode="numeric" autoComplete="new-password" value={pin} onChange={(e) => setPin(digits(e.target.value))} className="w-40 tracking-[0.3em]" />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="plum" className="min-h-11" disabled={pending || pin.length < 4 || (needCurrent && current.length < 4)} onClick={() => run(pin)}>
              {pending ? "Saving…" : "Save PIN"}
            </Button>
            {isSet && (
              <Button type="button" variant="secondary" className="min-h-11" disabled={pending || (needCurrent && current.length < 4)} onClick={() => run("")}>
                Remove PIN
              </Button>
            )}
            <Button type="button" variant="secondary" className="min-h-11" disabled={pending} onClick={() => { setOpen(false); setPin(""); setCurrent(""); setMsg(null); }}>
              Cancel
            </Button>
          </div>
          {teacher && isSet && <p className="text-sm text-muted">As the teacher you don&apos;t need the old PIN; this is how a forgotten PIN is reset.</p>}
        </div>
      )}
      {msg && <p className={cx("rounded-xl px-3 py-2", msg.ok ? "bg-sage-soft" : "bg-danger-soft text-danger")}>{msg.text}</p>}
    </div>
  );
}
