import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { LessonSheet } from "@/components/lesson-sheet";
import { PrintButton } from "@/components/print-button";
import { getViewer } from "@/lib/auth";
import { getLesson, getStudent, getTeacherForStudent } from "@/lib/data";
import { listActiveReminders } from "@/lib/reminders";

type Params = Promise<{ id: string }>;

// One printable page for the parent. Plain, high-contrast, letter-size.
export default function SheetPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={null}>
      <Body params={params} />
    </Suspense>
  );
}

async function Body({ params }: { params: Params }) {
  const viewer = await getViewer();
  const { id } = await params;
  const lesson = await getLesson(id);
  if (!lesson) notFound();
  const student = await getStudent(lesson.student_id);
  if (!student) notFound();
  const [teacher, reminders] = await Promise.all([getTeacherForStudent(student), listActiveReminders(student.id)]);
  const isTeacher = !!viewer.teacher && viewer.teacher.id === student.teacher_id;
  const backHref = isTeacher ? `/lessons/${id}` : `/family/${student.id}`;

  return (
    <div className="default-text-sizes min-h-screen bg-paper print:bg-white">
      <div className="no-print mx-auto flex max-w-[8.5in] items-center justify-between gap-3 px-4 py-3">
        <Link href={backHref} className="text-sm font-medium text-accent-ink">
          ‹ Back
        </Link>
        <div className="flex items-center gap-2">
          {lesson.status === "draft" && (
            <span className="rounded-full bg-amber-soft px-2.5 py-0.5 text-xs font-medium text-amber">Draft</span>
          )}
          <PrintButton />
        </div>
      </div>

      <LessonSheet lesson={lesson} student={student} teacher={teacher} reminders={reminders} />
    </div>
  );
}
