import Link from "next/link";
import { Suspense } from "react";
import { Shell } from "@/components/shell";
import { Me } from "@/components/v3/me";
import { Avatar } from "@/components/avatar";
import { InstrumentTag } from "@/components/instrument-tag";
import { Card, EmptyState, LinkButton, Pill } from "@/components/ui";
import { requireTeacher } from "@/lib/auth";
import { studentPhotoSrc } from "@/lib/constants";
import { getLatestLesson, getPracticeWeek, listStudents, practiceTone } from "@/lib/data";
import { relativeDay } from "@/lib/format";

// Version 3: the student list. Each student opens on their timeline.
export default function V3Students() {
  return (
    <Shell
      title="Students"
      v3Tab="students"
      me={<Me />}
      actions={
        <LinkButton href="/students/new" variant="secondary" className="min-h-9 px-3 text-sm">
          + Student
        </LinkButton>
      }
    >
      <Suspense fallback={<div className="h-40 animate-pulse rounded-2xl bg-sheet" />}>
        <Body />
      </Suspense>
    </Shell>
  );
}

async function Body() {
  await requireTeacher();
  const students = await listStudents();
  if (students.length === 0) {
    return (
      <EmptyState title="No students yet" action={<LinkButton href="/students/new">Add your first student</LinkButton>}>
        Each student gets one timeline of lessons, practice, videos and reviews.
      </EmptyState>
    );
  }
  const rows = await Promise.all(
    students.map(async (s) => {
      const [latest, week] = await Promise.all([getLatestLesson(s.id), getPracticeWeek(s.id)]);
      return { s, latest, week };
    }),
  );
  return (
    <div className="flex flex-col gap-3">
      {rows.map(({ s, latest, week }) => (
        <Link key={s.id} href={`/v3/students/${s.id}`} className="block">
          <Card className="flex items-center gap-3">
            <Avatar name={s.name} instrument={s.instrument} photoSrc={studentPhotoSrc(s)} size="lg" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[19px] font-semibold">{s.name}</span>
                <InstrumentTag instrument={s.instrument} />
                {!s.active && <Pill>inactive</Pill>}
              </div>
              {s.current_book && <div className="text-sm text-muted">{s.current_book}</div>}
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                <Pill tone={practiceTone(week)}>
                  {week.daysPracticed}/{week.days.length} days practised
                </Pill>
                {latest && (
                  <Pill tone={latest.status === "draft" ? "amber" : "muted"}>
                    {latest.status === "draft" ? "draft " : "lesson "}
                    {relativeDay(latest.lesson_date)}
                  </Pill>
                )}
              </div>
            </div>
            <span className="text-xl text-accent-ink" aria-hidden>
              ›
            </span>
          </Card>
        </Link>
      ))}
    </div>
  );
}
