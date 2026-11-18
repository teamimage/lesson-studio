"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, cx } from "@/components/ui";
import { LocalTime } from "@/components/local-time";
import { joinPracticeSessions, splitPracticeSession } from "@/app/family/merge-actions";

export type JoinSession = {
  id: string;
  startedAt: string;
  minutes: number;
  /** Still uploading or being reviewed: can't be joined yet. */
  busy: boolean;
  /** Joined from this many recordings already (0 = an ordinary recording). */
  parts: number;
};

// On a practice day with more than one recording: pick two or more and join
// them into one practice, which is then reviewed again as a whole (a
// practice recorded in pieces). A joined practice can be split back into
// its original recordings and reviews. The parent PIN applies here as it
// does to editing the day.
export function PracticeJoinPanel({
  studentId,
  date,
  sessions,
  pinRequired = false,
  familyMode = false,
}: {
  studentId: string;
  date: string;
  sessions: JoinSession[];
  pinRequired?: boolean;
  familyMode?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(() => new Set(sessions.filter((s) => !s.busy).map((s) => s.id)));
  const [pin, setPin] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const [working, setWorking] = useState<string | null>(null);

  const joinable = sessions.filter((s) => !s.busy);
  const joined = sessions.filter((s) => s.parts > 1);
  const pinShort = pinRequired && pin.length < 4;

  function toggle(id: string) {
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function join() {
    setMsg(null);
    setWorking("Joining and reviewing the practice again. This takes about a minute…");
    start(async () => {
      const res = await joinPracticeSessions({ studentId, date, ids: [...picked], pin, familyMode });
      setWorking(null);
      if (!res.ok) {
        setMsg({ ok: false, text: res.error });
        return;
      }
      setOpen(false);
      setPin("");
      setMsg({ ok: true, text: "Joined into one practice and reviewed again as a whole. Split back below if that was a mistake." });
      router.refresh();
    });
  }

  function split(id: string) {
    setMsg(null);
    setWorking("Splitting back into the original recordings…");
    start(async () => {
      const res = await splitPracticeSession({ studentId, date, id, pin, familyMode });
      setWorking(null);
      if (!res.ok) {
        setMsg({ ok: false, text: res.error });
        return;
      }
      setPin("");
      setMsg({ ok: true, text: "Split back into the original recordings, with their own reviews." });
      router.refresh();
    });
  }

  const pinField = pinRequired && (
    <label className="flex flex-col gap-1">
      <span className="text-sm text-muted">Parent PIN</span>
      <Input
        type="password"
        inputMode="numeric"
        autoComplete="off"
        maxLength={8}
        value={pin}
        onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
        className="w-40 text-center tracking-[0.3em]"
      />
    </label>
  );

  if (joinable.length < 2 && !joined.length && !msg) return null;

  return (
    <div className="flex flex-col gap-3 text-[16px]">
      {msg && (
        <p role="status" className={cx("rounded-xl px-3 py-2", msg.ok ? "bg-sage-soft" : "bg-danger-soft text-danger")}>
          {msg.text}
        </p>
      )}
      {working && <p className="rounded-xl bg-plum-soft px-3 py-2">{working}</p>}

      {joined.map((s) => (
        <div key={s.id} className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-muted">
            The practice from <LocalTime iso={s.startedAt} /> was joined from {s.parts} recordings.
          </span>
          <Button type="button" variant="secondary" className="min-h-11" disabled={pending || s.busy || pinShort} onClick={() => split(s.id)}>
            Split back
          </Button>
        </div>
      ))}
      {joined.length > 0 && !open && pinField}

      {joinable.length >= 2 && !open && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-muted">Recorded one practice in pieces?</span>
          <Button
            type="button"
            variant="secondary"
            className="min-h-11"
            disabled={pending}
            onClick={() => {
              setMsg(null);
              setOpen(true);
            }}
          >
            {pinRequired ? "🔒 Join recordings" : "Join recordings"}
          </Button>
        </div>
      )}

      {open && (
        <div className="flex flex-col gap-3">
          <h3 className="font-semibold">Join into one practice</h3>
          <p className="text-sm text-muted">
            The recordings are put end to end and reviewed again as one practice, with one grade. You can split them back
            afterwards.
          </p>
          <ul className="flex flex-col">
            {sessions.map((s) => (
              <li key={s.id} className="border-b border-rule last:border-b-0">
                <label className={cx("flex min-h-14 items-center gap-3 py-2", s.busy ? "opacity-50" : "cursor-pointer")}>
                  <input
                    type="checkbox"
                    disabled={s.busy}
                    checked={!s.busy && picked.has(s.id)}
                    onChange={() => toggle(s.id)}
                    className="h-7 w-7 shrink-0 accent-[var(--sage)]"
                  />
                  <span>
                    <LocalTime iso={s.startedAt} /> · {s.minutes < 1 ? "under a minute" : `${s.minutes} min`}
                    {s.parts > 1 && <span className="text-muted"> · already joined from {s.parts}</span>}
                    {s.busy && <span className="text-muted"> · still being reviewed</span>}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          {pinField}
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="plum" className="min-h-12" disabled={pending || picked.size < 2 || pinShort} onClick={join}>
              {pending ? "Joining…" : `Join ${picked.size} recordings`}
            </Button>
            <Button type="button" variant="secondary" className="min-h-12" disabled={pending} onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
