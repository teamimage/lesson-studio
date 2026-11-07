import Link from "next/link";
import { Suspense } from "react";
import { Avatar } from "@/components/avatar";
import { InstrumentTag } from "@/components/instrument-tag";
import { studentPhotoSrc } from "@/lib/constants";
import { Shell } from "@/components/shell";
import { WeekStrip } from "@/components/week-strip";
import { Card, EmptyState, Pill } from "@/components/ui";
import { getViewer } from "@/lib/auth";
import { getCurrentPlan, getPracticeWeek, listStudents } from "@/lib/data";
import { daysBetween, formatDate, todayISO } from "@/lib/format";
import { getUiVersion } from "@/lib/ui-version-server";
import { getPracticeView } from "@/lib/practice-view-server";
import { PracticeViewToggle } from "@/components/practice-view-toggle";

// The family side: one card per child with today's plan.
export default function FamilyPage() {
  return (
    <Shell title="Home practice" eyebrow="Family" tab="family">
      <Suspense fallback={<div className="h-40 animate-pulse rounded-2xl bg-sheet" />}>
        <Body />
      </Suspense>
    </Shell>
  );
}

async function Body() {
  const [viewer, ui, view] = await Promise.all([getViewer(), getUiVersion(), getPracticeView()]);
  const students = (await listStudents()).filter((s) => s.active);
  const today = todayISO();
  const rows = await Promise.all(
    students.map(async (s) => {
      const [plan, week] = await Promise.all([getCurrentPlan(s.id), getPracticeWeek(s.id)]);
      return { student: s, plan, week };
    }),
  );

  if (rows.length === 0) {
    return (
      <EmptyState title="No students linked to this account yet">
        {viewer.teacher
          ? "Add a student in the Studio tab. This view shows what their family sees."
          : "Ask your teacher for an invite link to your child's practice page, then open it on this device."}
      </EmptyState>
    );
  }

  // Proposed version: the teacher flips between their overview and the
  // family's own page with the Teacher / Family switch.
  const toggle = ui === "proposed" && !!viewer.teacher;
  if (toggle && view === "teacher") {
    return (
      <div className="flex flex-col gap-4">
        <PracticeViewToggle view={view} />
        <Overview rows={rows} today={today} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {toggle && <PracticeViewToggle view={view} />}
      <p className="text-sm text-muted">{formatDate(today, "long")}</p>
      {rows.map(({ student, plan, week }) => {
        const todayLog = week.logs.find((l) => l.practice_date === today);
        const doneToday = todayLog && ((todayLog.minutes ?? 0) > 0 || todayLog.completed_assignment_ids.length > 0);
        return (
          <Link key={student.id} href={`/family/${student.id}`} className="block">
            <Card tone="plum" className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <Avatar name={student.name} instrument={student.instrument} photoSrc={studentPhotoSrc(student)} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-[18px] font-semibold leading-tight">{student.name}</span>
                    <InstrumentTag instrument={student.instrument} />
                  </div>
                  {student.current_book && <div className="text-sm text-muted">{student.current_book}</div>}
                </div>
                {doneToday ? <Pill tone="sage">✓ practiced today</Pill> : <Pill tone="plum">today&apos;s plan →</Pill>}
              </div>
              {plan ? (
                <div className="text-sm">
                  <span className="text-muted">Focus: </span>
                  {plan.focus_points || plan.summary || `${plan.assignments.length} assignments`}
                </div>
              ) : (
                <div className="text-sm text-muted">No approved lesson yet. The plan appears after the teacher approves one.</div>
              )}
              <WeekStrip week={week} />
            </Card>
          </Link>
        );
      })}
      {viewer.teacher && !toggle && (
        <p className="text-center text-xs text-muted">
          You&apos;re seeing the parent view as the teacher. Parents see only their own children.
        </p>
      )}
    </div>
  );
}

type Row = { student: Awaited<ReturnType<typeof listStudents>>[number]; week: Awaited<ReturnType<typeof getPracticeWeek>> };

// Proposed version, teacher only: every student's practice since their last
// lesson on one screen, most in need of a nudge first. Each row opens that
// child's page; the Family side of the switch shows it as their parent does.
function Overview({ rows, today }: { rows: Row[]; today: string }) {
  const items = rows
    .map(({ student, week }) => {
      const practicedDays = week.logs
        .filter((l) => (l.minutes ?? 0) > 0 || l.completed_assignment_ids.length > 0)
        .map((l) => l.practice_date)
        .sort();
      const last = practicedDays[practicedDays.length - 1] ?? null;
      const quiet = last ? daysBetween(last, today) : null;
      const share = week.days.length ? week.daysPracticed / week.days.length : 0;
      return { student, week, last, quiet, share };
    })
    .sort((a, b) => a.share - b.share);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[16px] text-muted">
        Practice since each student&apos;s last lesson, {formatDate(today, "long")}. Students who need a nudge come first.
      </p>
      <div className="flex flex-col gap-2">
        {items.map(({ student, week, last, quiet, share }) => (
          <Link key={student.id} href={`/family/${student.id}`} className="block">
            <Card className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <Avatar name={student.name} instrument={student.instrument} photoSrc={studentPhotoSrc(student)} />
                <div className="min-w-0 flex-1">
                  <div className="text-[18px] font-semibold leading-tight">{student.name}</div>
                  <div className="text-sm text-muted">
                    {week.since ? `since the ${formatDate(week.since, "weekday")} lesson` : "last 7 days"}
                  </div>
                </div>
                {quiet === null ? (
                  <Pill tone="danger">no practice yet</Pill>
                ) : quiet >= 3 ? (
                  <Pill tone="amber">quiet {quiet} days</Pill>
                ) : share >= 0.7 ? (
                  <Pill tone="sage">on track</Pill>
                ) : (
                  <Pill>practicing</Pill>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <Figure value={`${week.daysPracticed}/${week.days.length}`} label="days" />
                <Figure value={`${week.totalMinutes}`} label="minutes" />
                <Figure value={last ? formatDate(last, "short") : "–"} label="last practice" />
              </div>
              <WeekStrip week={week} />
              <span className="text-sm font-medium text-accent-ink">Open practice page ›</span>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}

function Figure({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-xl bg-paper px-2 py-2">
      <div className="text-[20px] font-semibold tabular-nums leading-tight">{value}</div>
      <div className="text-xs text-muted">{label}</div>
    </div>
  );
}
