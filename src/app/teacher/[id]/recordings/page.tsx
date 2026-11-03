import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Shell } from "@/components/shell";
import { StudentVideos } from "@/components/student-videos";
import { requireTeacher } from "@/lib/auth";
import { getStudent, listLessons } from "@/lib/data";
import { listRecordingsForStudent } from "@/lib/recordings";

type Params = Promise<{ id: string }>;

// A student's lesson videos, newest lesson first, and where to upload more.
export default function DeskRecordingsPage({ params }: { params: Params }) {
  return (
    <Suspense
      fallback={<Shell title="Recordings" tab="desk" back={{ href: "/teacher", label: "Teacher desk" }}>{null}</Shell>}
    >
      <Body params={params} />
    </Suspense>
  );
}

async function Body({ params }: { params: Params }) {
  await requireTeacher();
  const { id } = await params;
  const student = await getStudent(id);
  if (!student) notFound();
  const [lessons, recordings] = await Promise.all([listLessons(id, 50), listRecordingsForStudent(id, 100)]);

  return (
    <Shell
      title="Recordings"
      eyebrow={student.name}
      back={{ href: `/teacher?student=${id}`, label: "Teacher desk" }}
      tab="desk"
    >
      <StudentVideos studentId={id} lessons={lessons} recordings={recordings} />
    </Shell>
  );
}
