import { Suspense } from "react";
import { notFound } from "next/navigation";
import { PreLessonBrief } from "@/components/pre-lesson-brief";
import { Shell } from "@/components/shell";
import { LinkButton } from "@/components/ui";
import { requireTeacher } from "@/lib/auth";
import { getPracticeWeek, getStudent, listLessons, listRepertoire } from "@/lib/data";

type Params = Promise<{ id: string }>;

// Two-minute read before the lesson: last time, what was assigned, how
// the week at home went, and what to consider today.
export default function BriefPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<Shell title="Pre-lesson brief" tab="studio">{null}</Shell>}>
      <Body params={params} />
    </Suspense>
  );
}

async function Body({ params }: { params: Params }) {
  await requireTeacher();
  const { id } = await params;
  const student = await getStudent(id);
  if (!student) notFound();
  const [lessons, week, repertoire] = await Promise.all([listLessons(id, 6), getPracticeWeek(id), listRepertoire(id)]);

  return (
    <Shell
      title={student.name}
      eyebrow="Pre-lesson brief"
      back={{ href: `/students/${id}`, label: student.name }}
      tab="studio"
      actions={
        <LinkButton href={`/students/${id}/lessons/new`} className="min-h-9 px-3 text-sm">
          Record lesson
        </LinkButton>
      }
    >
      <PreLessonBrief student={student} lessons={lessons} week={week} repertoire={repertoire} />
    </Shell>
  );
}
