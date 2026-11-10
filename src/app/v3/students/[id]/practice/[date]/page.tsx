import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Shell } from "@/components/shell";
import { Me } from "@/components/v3/me";
import { GRADE_TONE, GradeLegend } from "@/components/grade-legend";
import { PracticeSessionList } from "@/components/practice-session-list";
import { Card, Pill, cx } from "@/components/ui";
import { requireTeacher } from "@/lib/auth";
import { getPracticeLog, getStudent } from "@/lib/data";
import { capitalize, formatDate, relativeDay } from "@/lib/format";
import { listPracticeSessions } from "@/lib/practice/data";
import { createClient } from "@/lib/supabase/server";

type Params = Promise<{ id: string; date: string }>;

// Version 3: one day of a student's practice, opened from a history card's
// title or from the calendar's day popup. Everything about that day: what
// the family logged and ticked, their note, and each recorded session with
// its grade and review.
export default function V3PracticeDayPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<Shell title=" " v3Tab="students" me={<Me />} wide>{null}</Shell>}>
      <Body params={params} />
    </Suspense>
  );
}

async function Body({ params }: { params: Params }) {
  await requireTeacher();
  const { id, date } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) notFound();
  const student = await getStudent(id);
  if (!student) notFound();
  const db = await createClient();
  const [log, sessions, { data: lessonsThatDay }] = await Promise.all([
    getPracticeLog(id, date),
    listPracticeSessions(id, 50, date),
    db.from("lessons").select("id, status").eq("student_id", id).eq("lesson_date", date),
  ]);
  const ticked = log?.completed_assignment_ids ?? [];
  const { data: tickedRows } = ticked.length
    ? await db.from("assignments").select("id, title").in("id", ticked)
    : { data: [] as { id: string; title: string }[] };
  const first = student.name.split(" ")[0];
  const minutes = log?.minutes ?? Math.round(sessions.reduce((n, s) => n + (s.playing_seconds ?? 0), 0) / 60);
  const grades = sessions.map((s) => s.review?.grade).filter(Boolean);
  const nothing = !log && sessions.length === 0;

  return (
    <Shell
      title={
        <span className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span>Practice, {formatDate(date, "long")}</span>
          {grades.map((g, i) => (
            <span
              key={i}
              className={cx(
                "inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full font-display text-[24px] font-semibold leading-none",
                GRADE_TONE[g as string] ?? "bg-rule text-ink",
              )}
              aria-label={`Grade ${g}`}
              title={`Grade ${g}`}
            >
              {g}
            </span>
          ))}
        </span>
      }
      eyebrow={`${first} · ${capitalize(relativeDay(date))}`}
      back={{ href: `/v3/students/${id}`, label: first }}
      v3Tab="students"
      me={<Me />}
      wide
    >
      <div className="flex flex-col gap-5">
        {nothing ? (
          <Card>
            <p className="text-[16px] text-muted">No practice on record for {first} this day.</p>
          </Card>
        ) : (
          <Card className="flex flex-col gap-3 text-[16px]">
            <div className="flex flex-wrap gap-1.5">
              {minutes > 0 && <Pill tone="sage">{minutes} min practised</Pill>}
              {sessions.length > 0 && (
                <Pill>
                  {sessions.length} recorded session{sessions.length === 1 ? "" : "s"}
                </Pill>
              )}
              {log?.listened && <Pill tone="plum">listened</Pill>}
            </div>
            {(tickedRows ?? []).length > 0 && (
              <div className="flex flex-col gap-1.5">
                <div className="text-[12px] font-semibold uppercase tracking-[0.1em] text-accent-ink">Ticked off</div>
                <ul className="flex flex-col gap-1.5">
                  {(tickedRows ?? []).map((a) => (
                    <li key={a.id} className="flex items-center gap-2">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sage text-xs text-white">✓</span>
                      {a.title}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {log?.parent_note && (
              <p className="rounded-xl bg-plum-soft px-3 py-2">
                <span className="font-medium text-plum">Parent: </span>
                {log.parent_note}
              </p>
            )}
          </Card>
        )}

        {sessions.length > 0 ? (
          <section className="flex flex-col gap-3">
            <h2 className="font-display text-[22px] font-semibold">Recorded practice</h2>
            <Card className="p-3 sm:p-4">
              <PracticeSessionList sessions={sessions} teacherView flat />
            </Card>
            <GradeLegend />
          </section>
        ) : (
          !nothing && <p className="text-sm text-muted">Logged by hand, no recording, so there&apos;s no grade or review.</p>
        )}

        {(lessonsThatDay ?? []).map((l) => (
          <Link key={l.id} href={`/v3/lessons/${l.id}`} className="text-[16px] text-accent-ink underline">
            {first} also had a lesson this day{l.status === "draft" ? " (draft)" : ""}: open the lesson
          </Link>
        ))}
      </div>
    </Shell>
  );
}
