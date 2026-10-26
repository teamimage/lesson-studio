import { Suspense } from "react";
import { notFound } from "next/navigation";
import { LessonForm } from "@/components/lesson-form";
import { Shell } from "@/components/shell";
import { Notice } from "@/components/ui";
import { saveLesson } from "@/app/lessons/actions";
import { requireTeacher } from "@/lib/auth";
import { getLesson, getStudent, listLessons, listRepertoire } from "@/lib/data";
import { formatDate } from "@/lib/format";
import { booksFor } from "@/lib/suzuki";

type Params = Promise<{ id: string }>;
type SP = Promise<{ error?: string }>;

export default function EditLessonPage({ params, searchParams }: { params: Params; searchParams: SP }) {
  return (
    <Suspense fallback={<Shell title="Edit lesson" tab="studio">{null}</Shell>}>
      <Body params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Body({ params, searchParams }: { params: Params; searchParams: SP }) {
  await requireTeacher();
  const { id } = await params;
  const { error } = await searchParams;
  const lesson = await getLesson(id);
  if (!lesson) notFound();
  const [student, repertoire, lessons] = await Promise.all([
    getStudent(lesson.student_id),
    listRepertoire(lesson.student_id),
    listLessons(lesson.student_id, 10),
  ]);
  if (!student) notFound();
  const previous = lessons.find((l) => l.id !== id && l.status === "approved" && l.lesson_date <= lesson.lesson_date);

  return (
    <Shell
      title={`Edit lesson · ${formatDate(lesson.lesson_date)}`}
      eyebrow={student.name}
      back={{ href: `/lessons/${id}`, label: "Lesson" }}
      tab="studio"
    >
      {error && (
        <div className="mb-4">
          <Notice tone="danger">Something went wrong saving. Try again.</Notice>
        </div>
      )}
      <LessonForm
        studentId={student.id}
        studentName={student.name}
        lessonId={id}
        isApproved={lesson.status === "approved"}
        action={saveLesson}
        knownPieces={repertoire.map((r) => r.title)}
        books={booksFor(student.instrument)}
        previousAssignments={(previous?.assignments ?? []).map((a) => ({
          kind: a.kind,
          title: a.title,
          how: a.how ?? "",
          every_day: a.every_day,
        }))}
        initial={{
          lesson_date: lesson.lesson_date,
          duration_minutes: lesson.duration_minutes,
          next_lesson_date: lesson.next_lesson_date,
          summary: lesson.summary ?? "",
          focus_points: lesson.focus_points ?? "",
          suggestions: lesson.suggestions ?? "",
          teacher_notes: lesson.teacher_notes ?? "",
          parent_message: lesson.parent_message ?? "",
          pieces: lesson.lesson_pieces.map((p) => ({ title: p.title, activity: p.activity, notes: p.notes ?? "" })),
          assignments: lesson.assignments.map((a) => ({
            id: a.id,
            kind: a.kind,
            title: a.title,
            how: a.how ?? "",
            every_day: a.every_day,
          })),
        }}
      />
    </Shell>
  );
}
