import { Suspense } from "react";
import { notFound } from "next/navigation";
import { MusicStand } from "@/components/music-stand";
import { requireTeacher } from "@/lib/auth";
import { getStudent } from "@/lib/data";
import { listScores } from "@/lib/scores";

type Params = Promise<{ id: string }>;

// The music stand with no lesson running: shows the student's music and
// records nothing. Only Start lesson starts a lesson; "Join lesson" on the
// stand switches to it once one is running.
export default function StandaloneStandPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<div className="flex h-dvh items-center justify-center text-muted">Opening the music stand…</div>}>
      <Body params={params} />
    </Suspense>
  );
}

async function Body({ params }: { params: Params }) {
  const { teacher } = await requireTeacher();
  const { id } = await params;
  const student = await getStudent(id);
  if (!student) notFound();
  const scores = await listScores(student.id);

  return (
    <MusicStand
      lessonId={null}
      studentId={student.id}
      teacherId={teacher.id}
      studentName={student.name}
      scores={scores}
      priorEvents={[]}
    />
  );
}
