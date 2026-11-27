"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Pill, cx } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { guestLabel, lessonsOf, type TakeawayLesson, type TakeawayScope, type TakeawaysView } from "@/lib/takeaways/types";

// "Main takeaways" on the student page, for the teacher and the family: what
// the last three approved lessons add up to, then "The specifics", each
// marked one time or repeated, with points from a guest instructor labelled.
// The lesson records keep every detail; this box is for focus. It writes
// itself (one short Claude call) when a lesson is approved, or the first
// time the page opens after the lessons changed. A long box shows its top
// part, fading out, with one Show more.

// Only a narrow point says so; a whole piece or a general point needs no label.
const SCOPE: Record<TakeawayScope, string> = { piece: "", section: "one section", general: "" };

async function post(studentId: string, force: boolean): Promise<string | null | "busy"> {
  const res = await fetch(`/api/students/${studentId}/takeaways`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ force }),
  }).catch(() => null);
  const body = (await res?.json().catch(() => null)) as { ok?: boolean; busy?: boolean; error?: string } | null;
  if (!body) return "Couldn't reach the server. Try again.";
  if (body.ok && body.busy) return "busy";
  return body.ok ? null : (body.error ?? "Something went wrong.");
}

async function write(studentId: string, force: boolean): Promise<string | null> {
  for (let i = 0; i < 40; i++) {
    const out = await post(studentId, force && i === 0);
    if (out !== "busy") return out;
    await new Promise((r) => setTimeout(r, 8000)); // another page is writing it
  }
  return "The takeaways are taking a long time. Try again.";
}

function span(lessons: TakeawayLesson[]): string {
  if (lessons.length === 1) return `from the ${formatDate(lessons[0].date)} lesson`;
  return `last ${lessons.length} lessons · ${formatDate(lessons[0].date)} to ${formatDate(lessons[lessons.length - 1].date)}`;
}

function Source({ parts, guest }: { parts: string[]; guest: string | null }) {
  const shown = parts.filter(Boolean);
  if (!shown.length && !guest) return null;
  return (
    <p className="text-sm text-muted">
      {shown.join(" · ")}
      {guest && (
        <>
          {shown.length > 0 && " · "}
          <span className="font-medium text-plum">{guest}</span>
        </>
      )}
    </p>
  );
}

export function LessonTakeaways({ view, studentId, teacherView = false }: { view: TakeawaysView; studentId: string; teacherView?: boolean }) {
  const router = useRouter();
  const ready = view.state === "ready" ? view : null;
  const [busy, setBusy] = useState(Boolean(ready && (ready.stale || ready.writing)));
  const [error, setError] = useState<string | null>(ready?.error ?? null);
  const started = useRef(false);
  const body = useRef<HTMLDivElement>(null);
  const [long, setLong] = useState(false);
  const [open, setOpen] = useState(false);

  async function run(force: boolean) {
    setBusy(true);
    setError(null);
    const err = await write(studentId, force);
    setBusy(false);
    if (err) setError(err);
    else router.refresh();
  }

  useEffect(() => {
    if (!ready || started.current || !(ready.stale || ready.writing)) return;
    started.current = true;
    void run(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready?.stale, ready?.writing]);

  useEffect(() => {
    const el = body.current;
    if (!el) return;
    const check = () => setLong(el.scrollHeight > el.clientHeight + 4 || el.dataset.open === "1");
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ready?.data]);

  if (view.state === "not_set_up")
    return teacherView ? (
      <p className="text-sm text-muted">Main takeaways from the last three lessons appear here once lesson-takeaways.sql has been run in Supabase.</p>
    ) : null;
  if (!ready) return null;
  const data = ready.data;
  // The family sees nothing until there is something written.
  if (!data && !teacherView) return null;

  const status = busy ? (
    <p className="text-sm text-muted">{data ? "Updating with the latest lesson…" : "Comparing the last lessons… this takes about half a minute."}</p>
  ) : error && teacherView ? (
    <p className="text-sm text-danger">
      {error}{" "}
      <button type="button" className="text-accent-ink underline" onClick={() => run(true)}>
        Try again
      </button>
    </p>
  ) : null;

  return (
    <section className="rounded-2xl border border-rule bg-sheet shadow-[0_1px_0_rgba(43,37,33,0.04)]">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 px-4 pt-3">
        <h2 className="font-display text-[20px] font-semibold">Main takeaways</h2>
        <span className="text-sm text-muted">{span(ready.lessons)}</span>
      </div>
      {data ? (
        <div className="relative">
          <div
            ref={body}
            data-open={open ? "1" : "0"}
            className={cx("flex flex-col gap-2 px-4 pb-3 pt-1", !open && "max-h-[24rem] overflow-hidden")}
          >
            {data.overall && <p className="text-[16px] leading-normal">{data.overall}</p>}
            {data.takeaways.length > 0 && (
              <ul className="flex flex-col divide-y divide-rule">
                {data.takeaways.map((p, i) => (
                  <li key={i} className="flex flex-col gap-0.5 py-2">
                    <span className="text-[17px] font-medium leading-snug">{p.text}</span>
                    <Source parts={[p.piece, SCOPE[p.scope] ?? ""]} guest={guestLabel(lessonsOf(p, ready.lessons))} />
                  </li>
                ))}
              </ul>
            )}
            {data.specifics.length > 0 && (
              <>
                <h3 className="mt-1 border-t border-rule pt-3 font-display text-[18px] font-semibold">The specifics</h3>
                <ul className="flex flex-col divide-y divide-rule">
                  {data.specifics.map((p, i) => {
                    const from = lessonsOf(p, ready.lessons);
                    const repeated = from.length > 1;
                    return (
                      <li key={i} className="flex flex-col gap-1 py-2">
                        <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                          <Pill tone={repeated ? "amber" : "muted"} className="text-[13px]">
                            {repeated ? `Repeated · ${from.length} lessons` : "One time"}
                          </Pill>
                          <span className="text-[16px] leading-snug">{p.text}</span>
                        </span>
                        <Source parts={[p.piece, from.map((l) => formatDate(l.date)).join(", ")]} guest={guestLabel(from)} />
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
            {status}
            {teacherView && !busy && (
              <button type="button" className="self-start text-sm text-accent-ink underline" onClick={() => run(true)}>
                Write again
              </button>
            )}
          </div>
          {long && !open && (
            <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-sheet to-transparent" />
          )}
        </div>
      ) : (
        <div className="px-4 pb-3 pt-1">{status}</div>
      )}
      {data && long && (
        <div className="relative flex items-center justify-center px-4 pb-3">
          <span aria-hidden className="absolute inset-x-4 top-1/2 h-px -translate-y-1/2 bg-rule" />
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            className="relative flex min-h-9 items-center gap-1.5 rounded-full border border-rule bg-paper px-4 text-sm font-medium text-accent-ink"
          >
            {open ? "Show less" : "Show more"}
            <span aria-hidden className={cx("inline-block transition-transform", open && "rotate-180")}>
              ▾
            </span>
          </button>
        </div>
      )}
    </section>
  );
}
