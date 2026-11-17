import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Shell } from "@/components/shell";
import { Me } from "@/components/v3/me";
import { GRADE_TONE, GradeLegend } from "@/components/grade-legend";
import { PracticeSessionList } from "@/components/practice-session-list";
import { PracticeDayEditor, type EditorItem } from "@/components/practice-day-editor";
import { Card, Pill, cx } from "@/components/ui";
import { getViewer } from "@/lib/auth";
import { heardOnDay } from "@/lib/practice/hand-ticks";
import { practicePinSet } from "@/lib/practice-pin";
import { getPracticeLog, getStudent } from "@/lib/data";
import { capitalize, formatDate, relativeDay } from "@/lib/format";
import { listPracticeSessions } from "@/lib/practice/data";
import { createClient } from "@/lib/supabase/server";
import { gradeMark, gradeName, gradingOfStudent } from "@/lib/grading";

type Params = Promise<{ id: string; date: string }>;
type SP = Promise<{ from?: string; edit?: string }>;

// Version 3: one day of a student's practice, opened from a history card's
// title or from the calendar's day popup. Everything about that day: what
// was done (the family or the teacher can tick off work the recording
// missed, and fix the minutes and note), and each recorded session with its
// grade and review. Open to the teacher and to the student's family.
export default function V3PracticeDayPage({ params, searchParams }: { params: Params; searchParams: SP }) {
  return (
    <Suspense fallback={<Shell title=" " v3Tab="students" me={<Me />} wide>{null}</Shell>}>
      <Body params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Body({ params, searchParams }: { params: Params; searchParams: SP }) {
  const viewer = await getViewer();
  const { id, date } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) notFound();
  // Row-level security: only the teacher and the student's family see the student.
  const student = await getStudent(id);
  if (!student) notFound();
  const isTeacher = !!viewer.teacher && viewer.teacher.id === student.teacher_id;
  // Opened from Family mode on the teacher's account: the parent PIN applies there too.
  const sp = await searchParams;
  const familyMode = sp.from === "family";
  const db = await createClient();
  const [log, sessions, { data: lessonsThatDay }, { data: plan }, pinSet] = await Promise.all([
    getPracticeLog(id, date),
    listPracticeSessions(id, 50, date),
    db.from("lessons").select("id, status").eq("student_id", id).eq("lesson_date", date),
    // The list the family was practising from that day.
    db
      .from("lessons")
      .select("id, assignments(id, title, sort_order)")
      .eq("student_id", id)
      .eq("status", "approved")
      .lte("lesson_date", date)
      .order("lesson_date", { ascending: false })
      .order("approved_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    practicePinSet(id, db),
  ]);
  const ticked = log?.completed_assignment_ids ?? [];
  const onPlan = (plan?.assignments ?? []).slice().sort((a, b) => a.sort_order - b.sort_order);
  const offPlan = ticked.filter((t) => !onPlan.some((a) => a.id === t));
  const { data: offRows } = offPlan.length
    ? await db.from("assignments").select("id, title").in("id", offPlan)
    : { data: [] as { id: string; title: string }[] };
  const heard = heardOnDay(sessions);
  const items: EditorItem[] = [
    ...onPlan.map((a) => ({ id: a.id, title: a.title, heard: heard.has(a.id) })),
    ...(offRows ?? []).map((a) => ({ id: a.id, title: a.title, heard: heard.has(a.id), offList: true })),
  ];
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
              aria-label={gradeName(g as string)}
              title={gradeName(g as string)}
            >
              {gradeMark(g as string)}
            </span>
          ))}
        </span>
      }
      eyebrow={`${first} · ${capitalize(relativeDay(date))}`}
      back={{ href: !isTeacher ? `/family/${id}` : familyMode ? `/v3/family/${id}` : `/v3/students/${id}`, label: first }}
      {...(!isTeacher ? { tab: "family" as const } : { v3Tab: familyMode ? ("family" as const) : ("students" as const) })}
      me={<Me />}
      wide
    >
      <div className="flex flex-col gap-5">
        {(sessions.length > 0 || log?.listened) && (
          <div className="flex flex-wrap gap-1.5">
            {minutes > 0 && <Pill tone="sage">{minutes} min practised</Pill>}
            {sessions.length > 0 && (
              <Pill>
                {sessions.length} recorded session{sessions.length === 1 ? "" : "s"}
              </Pill>
            )}
            {log?.listened && <Pill tone="plum">listened</Pill>}
          </div>
        )}
        {nothing && <p className="text-[16px] text-muted">No practice on record for {first} this day yet.</p>}
        <Card>
          <PracticeDayEditor
            key={date}
            studentId={id}
            date={date}
            items={items}
            recorded={sessions.some((s) => !!s.review)}
            canRegrade={isTeacher && !familyMode}
            pinRequired={pinSet && (!isTeacher || familyMode)}
            familyMode={familyMode}
            startEditing={sp.edit === "1"}
            initial={{
              done: ticked,
              minutes: log?.minutes ?? null,
              listened: !!log?.listened,
              note: log?.parent_note ?? "",
            }}
          />
        </Card>

        {sessions.length > 0 ? (
          <section className="flex flex-col gap-3">
            <h2 className="font-display text-[22px] font-semibold">Recorded practice</h2>
            <Card className="p-3 sm:p-4">
              <PracticeSessionList sessions={sessions} teacherView={isTeacher} canSwitch={isTeacher} flat />
            </Card>
            <GradeLegend family={!isTeacher} grading={gradingOfStudent(student)} instrument={student.instrument} />
          </section>
        ) : (
          !nothing && <p className="text-sm text-muted">Logged by hand, no recording, so there&apos;s no grade or review.</p>
        )}

        {isTeacher && (lessonsThatDay ?? []).map((l) => (
          <Link key={l.id} href={`/v3/lessons/${l.id}`} className="text-[16px] text-accent-ink underline">
            {first} also had a lesson this day{l.status === "draft" ? " (draft)" : ""}: open the lesson
          </Link>
        ))}
      </div>
    </Shell>
  );
}
