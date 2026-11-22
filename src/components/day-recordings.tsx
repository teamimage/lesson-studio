"use client";

import Link from "next/link";
import { useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button, cx } from "@/components/ui";
import { LocalTime } from "@/components/local-time";
import { GRADE_TONE } from "@/components/grade-legend";
import { deleteDayLesson, deleteDayPractice, joinPracticeSessions } from "@/app/family/merge-actions";
import { activityFromFile } from "@/lib/practice/listen-file";
import { gradeMark, gradeName } from "@/lib/grading";
import { formatTime } from "@/lib/schedule";
import type { LessonMark } from "@/lib/lesson-mark-types";
import type { DaySession, PracticeDay } from "@/lib/practice/data";

// The calendar day pop-up's list: one row for each lesson and each recorded
// practice that day (a practice stopped and restarted shows as two), each
// opening its own page. On the teacher's student page, pressing and holding
// a row starts choosing: tap more rows, then delete them, or combine them
// into one practice (reviewed again as a whole) or into one lesson (drafted
// again from everything together).

const HOLD_MS = 500;
const row = "flex min-h-16 items-center gap-3 rounded-2xl border px-3 py-2.5";

type Key = `l:${string}` | `p:${string}`;

type ConvertOut = { ok: true; href: string; sessionId?: string } | { ok: false; error: string };

async function convert(body: unknown): Promise<ConvertOut> {
  const res = await fetch("/api/convert", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => null);
  return ((await res?.json().catch(() => null)) as ConvertOut | null) ?? { ok: false, error: "Couldn't reach the server. Try again." };
}

function minutesOf(seconds: number): string {
  const m = Math.round(seconds / 60);
  return m < 1 ? "under a minute" : `${m} min`;
}

function sessionWords(s: DaySession): string {
  if (s.pending === "processing") return "processing, review on its way";
  if (s.pending === "stuck") return "needs a look: the upload or review didn't finish";
  if (s.status === "error") return "the review didn't finish";
  if (s.counted === false || s.review?.counted === false) return "not counted";
  return "";
}

function Hold({
  onHold,
  onTap,
  selecting,
  children,
}: {
  onHold: () => void;
  onTap: () => void;
  selecting: boolean;
  children: ReactNode;
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);
  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  return (
    <div
      className="select-none [-webkit-touch-callout:none]"
      onPointerDown={(e) => {
        fired.current = false;
        start.current = { x: e.clientX, y: e.clientY };
        clear();
        timer.current = setTimeout(() => {
          fired.current = true;
          onHold();
        }, HOLD_MS);
      }}
      onPointerMove={(e) => {
        if (start.current && Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 10) clear();
      }}
      onPointerUp={clear}
      onPointerCancel={clear}
      onContextMenu={(e) => {
        e.preventDefault();
        clear();
        fired.current = true;
        onHold();
      }}
      onClickCapture={(e) => {
        if (fired.current || selecting) {
          e.preventDefault();
          e.stopPropagation();
          if (!fired.current) onTap();
          fired.current = false;
        }
      }}
    >
      {children}
    </div>
  );
}

export function DayRecordings({
  date,
  day,
  lessons,
  practiceHref,
  manageFor,
  onClose,
  go,
}: {
  date: string;
  day?: PracticeDay;
  lessons: LessonMark[];
  practiceHref: string;
  /** The teacher's student page: the student's id, to delete and combine from here. */
  manageFor?: string;
  onClose: () => void;
  go: ReactNode;
}) {
  const router = useRouter();
  const [picked, setPicked] = useState<Set<Key>>(new Set());
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const selecting = picked.size > 0;
  const sessions = (day?.sessions ?? []).slice().sort((a, b) => a.started_at.localeCompare(b.started_at));

  const canPickSession = (s: DaySession) => s.status === "done" || s.status === "error";
  const canPickLesson = (l: LessonMark) => !!l.lessonId && !l.upcoming;

  function toggle(k: Key) {
    setError(null);
    setSure(false);
    setPicked((p) => {
      const n = new Set(p);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  }
  function hold(k: Key) {
    if (!manageFor) return;
    if (navigator.vibrate) navigator.vibrate(15);
    setPicked((p) => new Set(p).add(k));
    setSure(false);
    setError(null);
  }

  const pickedSessions = sessions.filter((s) => picked.has(`p:${s.id}`));
  const pickedLessons = lessons.filter((l) => l.lessonId && picked.has(`l:${l.lessonId}`));
  const approvedPicked = pickedLessons.some((l) => l.status !== "draft");
  const total = pickedSessions.length + pickedLessons.length;
  const practiceBlock =
    total < 2 ? "Pick two or more to combine." : approvedPicked ? "An approved lesson can't be combined. Move it back to draft first." : null;
  const lessonBlock =
    pickedLessons.length > 1
      ? "Pick one lesson at most to combine into."
      : !pickedSessions.length
        ? "Pick a practice to add to a lesson."
        : approvedPicked
          ? "That lesson is approved. Move it back to draft first."
          : null;

  async function run(label: string, work: () => Promise<string | null>) {
    setBusy(label);
    setError(null);
    const err = await work().catch(() => "Something went wrong. Try again.");
    setBusy(null);
    if (err) setError(err);
  }

  function remove() {
    if (!manageFor) return;
    void run(`Deleting ${total === 1 ? "it" : `${total} items`}…`, async () => {
      for (const s of pickedSessions) {
        const r = await deleteDayPractice({ studentId: manageFor, date, id: s.id });
        if (!r.ok) return r.error;
      }
      for (const l of pickedLessons) {
        const r = await deleteDayLesson({ studentId: manageFor, date, lessonId: l.lessonId! });
        if (!r.ok) return r.error;
      }
      setPicked(new Set());
      onClose();
      router.refresh();
      return null;
    });
  }

  function toPractice() {
    if (!manageFor || practiceBlock) return;
    void run("Combining into one practice…", async () => {
      const ids = pickedSessions.map((s) => s.id);
      for (const l of pickedLessons) {
        let activity: unknown = [];
        setBusy("Getting the lesson recording…");
        const audio = (await fetch("/api/convert", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ kind: "lesson-audio", lessonId: l.lessonId }),
        })
          .then((r) => r.json())
          .catch(() => ({ url: null }))) as { url?: string | null };
        if (audio.url) {
          try {
            activity = await activityFromFile(audio.url, (f) => setBusy(`Listening through the lesson recording… ${Math.round(f * 100)}%`));
          } catch {
            activity = [];
          }
        }
        setBusy("Turning the lesson into a practice…");
        const out = await convert({ kind: "lesson-to-practice", lessonId: l.lessonId, activity, review: false });
        if (!out.ok) return out.error;
        if (out.sessionId) ids.push(out.sessionId);
      }
      setBusy("Reviewing it again as one practice… (about a minute)");
      const r = await joinPracticeSessions({ studentId: manageFor, date, ids });
      if (!r.ok) return r.error;
      router.push(practiceHref);
      return null;
    });
  }

  function toLesson() {
    if (!manageFor || lessonBlock) return;
    void run("Combining into one lesson… Claude drafts it again (a minute or two)", async () => {
      const out = await convert({
        kind: "practices-to-lesson",
        sessionIds: pickedSessions.map((s) => s.id),
        lessonId: pickedLessons[0]?.lessonId ?? null,
      });
      if (!out.ok) return out.error;
      router.push(out.href);
      return null;
    });
  }

  const check = (on: boolean) => (
    <span
      className={cx(
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-sm font-bold",
        on ? "border-plum bg-plum text-white" : "border-rule bg-paper",
      )}
      aria-hidden
    >
      {on ? "✓" : ""}
    </span>
  );

  return (
    <>
      {manageFor && !selecting && (lessons.some(canPickLesson) || sessions.length > 0) && (
        <li className="-mt-1 text-sm text-muted">Press and hold a recording to delete it or combine it with others.</li>
      )}

      {lessons.map((l, i) => {
        const key: Key | null = l.lessonId ? `l:${l.lessonId}` : null;
        const on = !!key && picked.has(key);
        const body = (
          <>
            {selecting && key && canPickLesson(l) ? check(on) : <LessonDot upcoming={l.upcoming} />}
            <span className="min-w-0">
              <span className="flex items-center gap-1.5 font-semibold">
                {l.upcoming ? "Lesson coming up" : "Lesson"}
                {l.pending && (
                  <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full bg-amber text-[9px] font-bold leading-none text-white" aria-hidden>
                    …
                  </span>
                )}
              </span>
              <span className="block text-sm text-muted">
                {[
                  l.time ? formatTime(l.time) : "",
                  l.minutes ? `${l.minutes} min` : "",
                  l.pending === "processing" ? "processing the video" : l.status === "draft" ? "draft to approve" : l.status === "approved" ? "approved" : "",
                ]
                  .filter(Boolean)
                  .join(" · ") || (l.upcoming ? "from the schedule" : "")}
              </span>
              {l.lengthFlag && (
                <span className="block text-sm text-accent-ink">
                  {l.lengthFlag === "unknown" ? "Video length not read. Set the length." : `Video is ${l.videoMinutes} min.`}
                </span>
              )}
            </span>
          </>
        );
        const cls = cx(row, on ? "border-plum bg-plum-soft" : l.lessonId ? "border-accent/40 bg-accent-soft hover:border-accent" : l.upcoming ? "border-dashed border-rule" : "border-accent/30 bg-accent-soft/60");
        return (
          <li key={l.lessonId ?? `${l.date}-${i}`}>
            {l.lessonId && key && canPickLesson(l) && manageFor ? (
              <Hold selecting={selecting} onHold={() => hold(key)} onTap={() => toggle(key)}>
                <Link href={`/v3/lessons/${l.lessonId}`} className={cls}>
                  {body}
                  {!selecting && go}
                </Link>
              </Hold>
            ) : l.lessonId ? (
              <Link href={`/v3/lessons/${l.lessonId}`} className={cls}>
                {body}
                {go}
              </Link>
            ) : (
              <div className={cls}>{body}</div>
            )}
          </li>
        );
      })}

      {sessions.map((s, i) => {
        const key: Key = `p:${s.id}`;
        const on = picked.has(key);
        const grade = s.review?.grade || null;
        const pickable = canPickSession(s);
        const words = sessionWords(s);
        const body = (
          <>
            {selecting && pickable ? (
              check(on)
            ) : grade ? (
              <span
                className={cx("flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl font-display text-xl font-semibold", GRADE_TONE[grade])}
                aria-label={gradeName(grade)}
              >
                {gradeMark(grade)}
              </span>
            ) : s.pending ? (
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber text-[12px] font-bold leading-none text-white" aria-hidden>
                {s.pending === "stuck" ? "!" : "…"}
              </span>
            ) : (
              <span className="h-5 w-5 shrink-0 rounded-full bg-sage" aria-hidden />
            )}
            <span className="min-w-0">
              <span className="block font-semibold">
                {sessions.length > 1 ? `Practice ${i + 1}` : "Practice"}, <LocalTime iso={s.started_at} />
              </span>
              <span className="block text-sm text-muted">
                {[minutesOf(s.duration_seconds), words, s.with_helper ? "with a helper" : "", s.recording_missing ? "no audio uploaded" : ""]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </span>
          </>
        );
        const cls = cx(row, on ? "border-plum bg-plum-soft" : "border-sage/40 bg-sage-soft hover:border-sage", selecting && !pickable && "opacity-50");
        return (
          <li key={s.id}>
            {manageFor && pickable ? (
              <Hold selecting={selecting} onHold={() => hold(key)} onTap={() => toggle(key)}>
                <Link href={practiceHref} className={cls}>
                  {body}
                  {!selecting && go}
                </Link>
              </Hold>
            ) : (
              <Link href={practiceHref} className={cls} onClick={(e) => selecting && e.preventDefault()}>
                {body}
                {!selecting && go}
              </Link>
            )}
          </li>
        );
      })}

      {day && sessions.length > 0 && (day.ticked.length > 0 || day.parentNote || day.listened) && !selecting && (
        <li>
          <Link href={practiceHref} className="flex items-center gap-2 px-1 py-1 text-sm text-muted">
            <span className="min-w-0 flex-1">
              Whole day:{" "}
              {[
                day.ticked.length ? `${day.ticked.length} item${day.ticked.length === 1 ? "" : "s"} ticked` : "",
                day.listened ? "listened" : "",
                day.parentNote ? `“${day.parentNote}”` : "",
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
            <span aria-hidden className="text-lg">›</span>
          </Link>
        </li>
      )}

      {selecting && (
        <li className="sticky bottom-0 -mx-4 flex flex-col gap-2 border-t border-rule bg-paper px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold">{total} picked</span>
            <button type="button" className="min-h-10 px-2 text-muted underline" disabled={!!busy} onClick={() => { setPicked(new Set()); setSure(false); setError(null); }}>
              Cancel
            </button>
          </div>
          {busy ? (
            <p className="rounded-xl bg-plum-soft px-3 py-2">{busy}</p>
          ) : sure ? (
            <div className="flex flex-col gap-2">
              <p>
                Delete {total === 1 ? "this" : `these ${total}`}? A deleted practice comes off the day&apos;s minutes; a deleted lesson takes its notes and video with it. This can&apos;t be undone.
              </p>
              <div className="flex gap-2">
                <Button type="button" variant="danger" className="min-h-12 flex-1" onClick={remove}>
                  Delete
                </Button>
                <Button type="button" variant="secondary" className="min-h-12 flex-1" onClick={() => setSure(false)}>
                  Keep
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <Button type="button" variant="plum" className="min-h-12" disabled={!!practiceBlock} onClick={toPractice}>
                Combine into one practice
              </Button>
              <Button type="button" variant="primary" className="min-h-12" disabled={!!lessonBlock} onClick={toLesson}>
                Combine into one lesson
              </Button>
              <Button type="button" variant="secondary" className="min-h-12 text-danger" onClick={() => setSure(true)}>
                Delete
              </Button>
            </div>
          )}
          {!busy && !sure && practiceBlock && lessonBlock && <p className="text-sm text-muted">{practiceBlock}</p>}
          {error && <p className="rounded-xl bg-danger-soft px-3 py-2 text-danger">{error}</p>}
        </li>
      )}
    </>
  );
}

function LessonDot({ upcoming }: { upcoming: boolean }) {
  return (
    <span
      className={cx(
        "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[12px] font-bold leading-none",
        upcoming ? "border border-accent bg-paper text-accent-ink" : "bg-accent text-white",
      )}
      aria-hidden
    >
      ♪
    </span>
  );
}
