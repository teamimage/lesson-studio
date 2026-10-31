import { Suspense } from "react";
import { notFound } from "next/navigation";
import { MusicStand } from "@/components/music-stand";
import { requireTeacher } from "@/lib/auth";
import { getLesson, getStudent } from "@/lib/data";
import { listScores, listStandEvents } from "@/lib/scores";

type Params = Promise<{ id: string }>;

// Full-screen music stand for one lesson. No app chrome: it is meant to sit
// on the music rack.
export default function StandPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<div className="flex h-dvh items-center justify-center text-muted">Opening the music stand…</div>}>
      <Body params={params} />
    </Suspense>
  );
}

async function Body({ params }: { params: Params }) {
  const { teacher } = await requireTeacher();
  const { id } = await params;
  const lesson = await getLesson(id);
  if (!lesson) notFound();
  const student = await getStudent(lesson.student_id);
  if (!student) notFound();
  const [scores, events] = await Promise.all([listScores(student.id), listStandEvents(id)]);

  return (
    <MusicStand
      lessonId={id}
      studentId={student.id}
      teacherId={teacher.id}
      studentName={student.name}
      scores={scores}
      priorEvents={events}
    />
  );
}
