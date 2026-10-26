import Link from "next/link";
import { Suspense } from "react";
import { Avatar } from "@/components/avatar";
import { Shell } from "@/components/shell";
import { WeekStrip } from "@/components/week-strip";
import { Card, EmptyState, Pill } from "@/components/ui";
import { getViewer } from "@/lib/auth";
import { getCurrentPlan, getPracticeWeek, listStudents } from "@/lib/data";
import { capitalize, formatDate, todayISO } from "@/lib/format";

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
  const viewer = await getViewer();
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
          : "Ask the teacher to add your email to your child's profile, then sign in again."}
      </EmptyState>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">{formatDate(today, "long")}</p>
      {rows.map(({ student, plan, week }) => {
        const todayLog = week.logs.find((l) => l.practice_date === today);
        const doneToday = todayLog && ((todayLog.minutes ?? 0) > 0 || todayLog.completed_assignment_ids.length > 0);
        return (
          <Link key={student.id} href={`/family/${student.id}`} className="block">
            <Card tone="plum" className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <Avatar name={student.name} instrument={student.instrument} />
                <div className="min-w-0 flex-1">
                  <div className="text-[17px] font-semibold leading-tight">{student.name}</div>
                  <div className="text-sm text-muted">
                    {capitalize(student.instrument)}
                    {student.current_book ? ` · ${student.current_book}` : ""}
                  </div>
                </div>
                {doneToday ? <Pill tone="sage">✓ practiced today</Pill> : <Pill tone="plum">today&apos;s plan →</Pill>}
              </div>
              {plan ? (
                <div className="text-sm">
                  <span className="text-muted">This week&apos;s focus: </span>
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
      {viewer.teacher && (
        <p className="text-center text-xs text-muted">
          You&apos;re seeing the parent view as the teacher. Parents see only their own children.
        </p>
      )}
    </div>
  );
}
