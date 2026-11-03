import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/print-button";
import { PeriodSheet } from "@/components/period-sheet";
import { PeriodReviewWriter } from "@/components/period-review-writer";
import { getViewer } from "@/lib/auth";
import { getStudent, getTeacherForStudent } from "@/lib/data";
import { addDays } from "@/lib/format";
import { getPeriod } from "@/lib/practice/period";

type Params = Promise<{ studentId: string; start: string }>;

// Practice from one lesson to the next for one student: the numbers, check
// marks per day and Claude's short review. Printable like the lesson sheet.
// Families reach it from Home practice; the teacher from the student page
// and the Desk. The date in the address is any day in the period.
export default function PracticeReviewPage({ params }: { params: Params }) {
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
  const [period, teacher] = await Promise.all([getPeriod(studentId, raw), getTeacherForStudent(student)]);
  if (!period) notFound();
  const isTeacher = !!viewer.teacher && viewer.teacher.id === student.teacher_id;
  const backHref = isTeacher ? `/students/${studentId}` : `/family/${studentId}`;
  const prev = period.prevStart ?? (period.startsWithLesson ? addDays(period.start, -1) : null);

  const generating = period.row?.status === "generating";
  let writer = null;
  if (period.hasActivity) {
    if (period.autoWrite || generating) {
      writer = <PeriodReviewWriter key={period.start} studentId={studentId} start={period.start} auto />;
    } else if (!period.review || !period.reviewUpToDate) {
      writer = (
        <PeriodReviewWriter
          key={period.start}
          studentId={studentId}
          start={period.start}
          label={period.review ? "Update the review" : period.isCurrent ? "Write the review so far" : "Write the review"}
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
          {prev && (
            <Link
              href={`/family/${studentId}/review/${prev}`}
              className="flex h-9 items-center rounded-lg px-2 text-accent-ink hover:bg-accent-soft"
            >
              ‹ Earlier
            </Link>
          )}
          {period.nextLesson && (
            <Link
              href={`/family/${studentId}/review/${period.nextLesson}`}
              className="flex h-9 items-center rounded-lg px-2 text-accent-ink hover:bg-accent-soft"
            >
              Later ›
            </Link>
          )}
          <PrintButton />
        </div>
      </div>
      {period.review && writer && <div className="no-print mx-auto max-w-[8.5in] px-4 pb-2">{writer}</div>}

      <PeriodSheet
        period={period}
        student={student}
        teacher={teacher}
        teacherView={isTeacher}
        writer={period.review ? undefined : writer}
      />
    </div>
  );
}
