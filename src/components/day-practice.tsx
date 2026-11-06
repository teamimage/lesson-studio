"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Card, Field, Input, Pill, Textarea, cx } from "@/components/ui";
import { JumpButton } from "@/components/video-popup";
import { ListenPlayer } from "@/components/listen-player";
import { loadPracticeLog, savePractice } from "@/app/family/actions";
import { addDays, formatDate } from "@/lib/format";
import { parsePlays, type ListenTrack } from "@/lib/reference-recordings";
import type { Jump } from "@/lib/lesson-moments";

export type DayLog = {
  practice_date: string;
  minutes: number | null;
  listened: boolean | null;
  completed_assignment_ids: string[] | null;
  parent_note: string | null;
  listen_plays: unknown;
};

export type DayItem = {
  id: string;
  title: string;
  kind: string | null;
  how: string | null;
  jump?: Jump;
  /** "11:07" or a lesson date when the clip is from an earlier lesson. */
  jumpLabel?: string;
  track?: ListenTrack;
  listenTimes: number;
};

// Today's practice: the plan's items to tick off for one day, with arrows to
// step between days. Days already loaded switch instantly; the days either
// side are fetched in the background so the arrows don't wait on the server.
export function DayPractice({
  studentId,
  today,
  initialDate,
  logs,
  knownFrom,
  items,
}: {
  studentId: string;
  today: string;
  initialDate: string;
  /** Logs the page already has, by date. */
  logs: DayLog[];
  /** Every date from here to today is in `logs` (missing = nothing logged). */
  knownFrom: string;
  items: DayItem[];
}) {
  const [date, setDate] = useState(initialDate);
  // Days fetched here; the page's own logs win, since a save or a counted
  // listen refreshes them.
  const [fetched, setFetched] = useState<Record<string, DayLog | null>>({});
  const cache = useMemo(
    () => ({ ...fetched, ...Object.fromEntries(logs.map((l) => [l.practice_date, l])) }) as Record<string, DayLog | null>,
    [fetched, logs],
  );
  const pending = useRef(new Set<string>());

  const known = useCallback(
    (d: string) => d in cache || (d >= knownFrom && d <= today),
    [cache, knownFrom, today],
  );

  const fetchDay = useCallback(
    (d: string) => {
      if (d > today || known(d) || pending.current.has(d)) return;
      pending.current.add(d);
      void loadPracticeLog(studentId, d)
        .then((l) => setFetched((c) => ({ ...c, [d]: (l as DayLog | null) ?? null })))
        .catch(() => {})
        .finally(() => pending.current.delete(d));
    },
    [known, studentId, today],
  );

  // Keep the neighbouring days ready.
  useEffect(() => {
    fetchDay(addDays(date, -1));
    fetchDay(addDays(date, -2));
    fetchDay(addDays(date, 1));
  }, [date, fetchDay]);

  function go(d: string) {
    if (d > today) return;
    setDate(d);
    fetchDay(d);
    const url = d === today ? window.location.pathname : `${window.location.pathname}?date=${d}`;
    window.history.replaceState(window.history.state, "", url);
  }

  const ready = known(date);
  const log = ready ? (cache[date] ?? null) : null;
  const completed = new Set(log?.completed_assignment_ids ?? []);
  const done = !!log && ((log.minutes ?? 0) > 0 || completed.size > 0);
  const plays = parsePlays(log?.listen_plays);
  const next = addDays(date, 1);
  const isToday = date === today;

  return (
    <Card tone="sheet" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
          <h2 className="text-lg font-semibold">
            {isToday ? "Today's practice" : `Practice, ${formatDate(date, "weekday")}`}
          </h2>
          {ready && (
            <span className={cx("text-sm", done ? "text-sage" : "text-muted")}>
              {done ? "practice done" : "practice not done"}
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {!isToday && (
            <button
              type="button"
              onClick={() => go(today)}
              className="mr-1 text-sm font-medium text-accent-ink underline"
            >
              today
            </button>
          )}
          <button
            type="button"
            onClick={() => go(addDays(date, -1))}
            className="flex h-12 w-12 items-center justify-center rounded-xl text-4xl leading-none text-accent-ink hover:bg-accent-soft active:bg-accent-soft"
            aria-label="Previous day"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => go(next)}
            disabled={next > today}
            className={cx(
              "flex h-12 w-12 items-center justify-center rounded-xl text-4xl leading-none",
              next > today ? "text-rule" : "text-accent-ink hover:bg-accent-soft active:bg-accent-soft",
            )}
            aria-label="Next day"
          >
            ›
          </button>
        </div>
      </div>

      {!ready ? (
        <div className="py-6 text-center text-sm text-muted">Loading…</div>
      ) : (
        <form key={date} action={savePractice} className="flex flex-col gap-3">
          <input type="hidden" name="student_id" value={studentId} />
          <input type="hidden" name="practice_date" value={date} />
          <ol className="flex flex-col gap-2">
            {items.map((a, i) => (
              <li
                key={a.id}
                className={cx(
                  a.track &&
                    "overflow-hidden rounded-2xl border border-rule bg-sheet has-[:checked]:border-sage has-[:checked]:bg-sage-soft",
                )}
              >
                <label
                  className={cx(
                    "flex cursor-pointer items-start gap-3 p-3",
                    !a.track &&
                      "rounded-2xl border border-rule bg-sheet has-[:checked]:border-sage has-[:checked]:bg-sage-soft",
                  )}
                >
                  <input
                    // Remounts when a play-through ticks it on the server.
                    key={`${a.id}-${completed.has(a.id)}`}
                    type="checkbox"
                    name="done"
                    value={a.id}
                    defaultChecked={completed.has(a.id)}
                    className="mt-1 h-6 w-6 shrink-0 accent-[var(--sage)]"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2">
                      <span className="font-medium">
                        {i + 1}. {a.title}
                      </span>
                      {a.kind === "listening" && <Pill tone="plum">listening</Pill>}
                      {a.kind === "review" && <Pill tone="sage">review</Pill>}
                      {a.kind === "game" && <Pill tone="amber">game</Pill>}
                      {a.jump && (
                        <JumpButton jump={a.jump} className="ml-auto font-medium">
                          ▶ Watch <span className="font-normal text-muted">{a.jumpLabel}</span>
                        </JumpButton>
                      )}
                    </span>
                    {a.how && <span className="block text-sm text-muted">{a.how}</span>}
                  </span>
                </label>
                {a.track && (
                  <div className="px-3 pb-3 pl-12">
                    <ListenPlayer
                      key={`${a.id}-${date}`}
                      track={a.track}
                      assignmentId={a.id}
                      studentId={studentId}
                      date={date}
                      times={a.listenTimes}
                      initialPlays={plays[a.id] ?? 0}
                    />
                  </div>
                )}
              </li>
            ))}
          </ol>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Minutes">
              <Input
                name="minutes"
                type="number"
                inputMode="numeric"
                min={0}
                max={600}
                defaultValue={log?.minutes ?? ""}
                placeholder="20"
              />
            </Field>
            <label className="flex items-end gap-3 pb-2.5 text-[16px]">
              <input
                type="checkbox"
                name="listened"
                defaultChecked={log?.listened ?? false}
                className="h-6 w-6 accent-[var(--plum)]"
              />
              Listened to the recording
            </label>
          </div>
          <Field
            label="Note for the teacher"
            hint="What was hard, what went well, a question. Shows up in the teacher's brief."
          >
            <Textarea name="parent_note" rows={2} defaultValue={log?.parent_note ?? ""} />
          </Field>
          <Button variant="plum" className="mt-1">
            {log ? "Update" : "Save"} {isToday ? "today's" : "this day's"} practice
          </Button>
        </form>
      )}
    </Card>
  );
}
