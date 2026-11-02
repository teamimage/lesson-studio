import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/print-button";
import { WeekSheet } from "@/components/week-sheet";
import { WeekReviewWriter } from "@/components/week-review-writer";
import { getViewer } from "@/lib/auth";
import { getStudent, getTeacherForStudent } from "@/lib/data";
import { addDays, todayISO } from "@/lib/format";
import { getWeek, weekStartOf } from "@/lib/practice/week";

type Params = Promise<{ studentId: string; start: string }>;

// One week of practice for one student, Monday to Sunday: the numbers, check
// marks per day and Claude's short review. Printable like the lesson sheet.
// Families reach it from Home practice; the teacher from the student page.
export default function WeekPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={null}>
      <Body params={params} />
    </Suspense>
  );
}

async function Body({ params }: { params: Params }) {
  const viewer = await getViewer();
  const { studentId, start: raw } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) notFound();
  const student = await getStudent(studentId);
  if (!student) notFound();
  const [week, teacher] = await Promise.all([getWeek(studentId, raw), getTeacherForStudent(student)]);
  const isTeacher = !!viewer.teacher && viewer.teacher.id === student.teacher_id;
  const backHref = isTeacher ? `/students/${studentId}` : `/family/${studentId}`;
  const thisWeek = weekStartOf(todayISO());
  const prev = addDays(week.start, -7);
  const next = addDays(week.start, 7);

  const generating = week.row?.status === "generating";
  let writer = null;
  if (week.hasActivity && !week.isFuture) {
    if (week.autoWrite || generating) {
      writer = <WeekReviewWriter key={week.start} studentId={studentId} weekStart={week.start} auto />;
    } else if (!week.review || !week.reviewUpToDate) {
      writer = (
        <WeekReviewWriter
          key={week.start}
          studentId={studentId}
          weekStart={week.start}
          label={week.review ? "Update the review" : week.isCurrent ? "Write this week's review so far" : "Write the review"}
        />
      );
    }
  }

  return (
    <div className="default-text-sizes min-h-screen bg-paper print:bg-white">
      <div className="no-print mx-auto flex max-w-[8.5in] flex-wrap items-center justify-between gap-3 px-4 py-3">
        <Link href={backHref} className="text-sm font-medium text-accent-ink">
          ‹ Back
        </Link>
        <div className="flex items-center gap-1 text-sm">
          <Link
            href={`/family/${studentId}/week/${prev}`}
            className="flex h-9 items-center rounded-lg px-2 text-accent-ink hover:bg-accent-soft"
          >
            ‹ Earlier
          </Link>
          {next <= thisWeek && (
            <Link
              href={`/family/${studentId}/week/${next}`}
              className="flex h-9 items-center rounded-lg px-2 text-accent-ink hover:bg-accent-soft"
            >
              Later ›
            </Link>
          )}
          <PrintButton />
        </div>
      </div>
      {week.review && writer && (
        <div className="no-print mx-auto max-w-[8.5in] px-4 pb-2">{writer}</div>
      )}

      <WeekSheet
        week={week}
        student={student}
        teacher={teacher}
        teacherView={isTeacher}
        writer={week.review ? undefined : writer}
      />
    </div>
  );
}
