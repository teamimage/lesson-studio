import { Suspense } from "react";
import { notFound } from "next/navigation";
import { RecordingList } from "@/components/recording-player";
import { Shell } from "@/components/shell";
import { Card, EmptyState, LinkButton, Pill, SectionTitle } from "@/components/ui";
import { requireTeacher } from "@/lib/auth";
import { getStudent, listLessons } from "@/lib/data";
import { formatDate } from "@/lib/format";
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

  const byLesson = lessons
    .map((l) => ({ lesson: l, videos: recordings.filter((r) => r.lesson_id === l.id) }))
    .filter((g) => g.videos.length > 0);

  return (
    <Shell
      title="Recordings"
      eyebrow={student.name}
      back={{ href: `/teacher?student=${id}`, label: "Teacher desk" }}
      tab="desk"
    >
      <div className="flex flex-col gap-6">
        <Card tone="accent" className="flex flex-col gap-3">
          <div>
            <div className="font-semibold">Add a lesson video</div>
            <p className="text-sm text-ink/80">
              Each video belongs to a lesson. Pick the lesson below, then choose the video file from your phone or
              computer. Big files are fine; if the upload stops, choose the same file again and it picks up where it
              left off.
            </p>
          </div>
          {lessons.length === 0 ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm">There are no lessons yet. Record today&apos;s lesson first, then add its video.</p>
              <LinkButton href={`/students/${id}/lessons/new`} className="self-start text-sm">
                Record lesson
              </LinkButton>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {lessons.slice(0, 4).map((l) => (
                <LinkButton
                  key={l.id}
                  href={`/lessons/${l.id}?upload=1#recordings`}
                  variant="secondary"
                  className="justify-between text-sm"
                >
                  <span>Upload to the {formatDate(l.lesson_date, "weekday")} lesson</span>
                  {l.status === "draft" && <Pill tone="amber">Draft</Pill>}
                </LinkButton>
              ))}
              <LinkButton href={`/students/${id}/lessons/new`} variant="ghost" className="self-start text-sm">
                + New lesson for today
              </LinkButton>
            </div>
          )}
        </Card>

        <section>
          <SectionTitle>Videos</SectionTitle>
          {byLesson.length === 0 ? (
            <EmptyState title="No videos yet">Videos you upload show up here, grouped by lesson.</EmptyState>
          ) : (
            <div className="flex flex-col gap-5">
              {byLesson.map(({ lesson, videos }) => (
                <div key={lesson.id}>
                  <div className="mb-2 flex items-baseline justify-between gap-2">
                    <div className="font-semibold">{formatDate(lesson.lesson_date, "long")}</div>
                    <LinkButton href={`/lessons/${lesson.id}`} variant="ghost" className="min-h-8 px-2 text-sm">
                      Open lesson ›
                    </LinkButton>
                  </div>
                  <RecordingList recordings={videos} editable />
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </Shell>
  );
}
