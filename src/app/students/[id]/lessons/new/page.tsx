import { Suspense } from "react";
import { notFound } from "next/navigation";
import { LessonForm } from "@/components/lesson-form";
import { Shell } from "@/components/shell";
import { Notice } from "@/components/ui";
import { saveLesson } from "@/app/lessons/actions";
import { requireTeacher } from "@/lib/auth";
import { getCurrentPlan, getStudent, listRepertoire } from "@/lib/data";
import { addDays, todayISO } from "@/lib/format";

type Params = Promise<{ id: string }>;
type SP = Promise<{ error?: string }>;

export default function NewLessonPage({ params, searchParams }: { params: Params; searchParams: SP }) {
  return (
    <Suspense fallback={<Shell title="Record lesson" tab="studio">{null}</Shell>}>
      <Body params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Body({ params, searchParams }: { params: Params; searchParams: SP }) {
  await requireTeacher();
  const { id } = await params;
  const { error } = await searchParams;
  const [student, plan, repertoire] = await Promise.all([getStudent(id), getCurrentPlan(id), listRepertoire(id)]);
  if (!student) notFound();
  const today = todayISO();

  return (
    <Shell title="Record lesson" eyebrow={student.name} back={{ href: `/students/${id}`, label: student.name }} tab="studio">
      {error && (
        <div className="mb-4">
          <Notice tone="danger">Something went wrong saving. Try again.</Notice>
        </div>
      )}
      <LessonForm
        studentId={id}
        studentName={student.name}
        action={saveLesson}
        knownPieces={repertoire.map((r) => r.title)}
        previousAssignments={(plan?.assignments ?? []).map((a) => ({
          kind: a.kind,
          title: a.title,
          how: a.how ?? "",
          every_day: a.every_day,
        }))}
        initial={{
          lesson_date: today,
          duration_minutes: plan?.duration_minutes ?? null,
          next_lesson_date: addDays(today, plan && plan.next_lesson_date && plan.lesson_date ? Math.max(1, Math.min(7, daysDiff(plan.lesson_date, plan.next_lesson_date))) : 7),
          summary: "",
          focus_points: "",
          suggestions: "",
          teacher_notes: "",
          parent_message: "",
          pieces: [],
          assignments: [],
        }}
      />
    </Shell>
  );
}

function daysDiff(a: string, b: string) {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86_400_000);
}
