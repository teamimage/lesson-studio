import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Shell } from "@/components/shell";
import { AssignmentList } from "@/components/assignment-list";
import { Button, Card, LinkButton, Notice, Pill, Row, SectionTitle } from "@/components/ui";
import { approveLesson, deleteLesson, unapproveLesson } from "@/app/lessons/actions";
import { requireTeacher } from "@/lib/auth";
import { getLesson, getStudent } from "@/lib/data";
import { formatDate, humanize } from "@/lib/format";
import { listRecordingsForLesson } from "@/lib/recordings";
import { RecordingList } from "@/components/recording-player";
import { RecordingUploader } from "@/components/recording-uploader";
import { LessonTimeline } from "@/components/lesson-timeline";
import { listScores, listStandEvents } from "@/lib/scores";

type Params = Promise<{ id: string }>;
type SP = Promise<{ approved?: string; upload?: string }>;

export default function LessonPage({ params, searchParams }: { params: Params; searchParams: SP }) {
  return (
    <Suspense fallback={<Shell title="Lesson" tab="studio">{null}</Shell>}>
      <Body params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Body({ params, searchParams }: { params: Params; searchParams: SP }) {
  await requireTeacher();
  const { id } = await params;
  const { approved, upload } = await searchParams;
  const [lesson, recordings, standEvents] = await Promise.all([
    getLesson(id),
    listRecordingsForLesson(id),
    listStandEvents(id),
  ]);
  if (!lesson) notFound();
  const [student, scores] = await Promise.all([
    getStudent(lesson.student_id),
    standEvents.length ? listScores(lesson.student_id, { includeArchived: true }) : Promise.resolve([]),
  ]);
  if (!student) notFound();
  const isDraft = lesson.status === "draft";

  return (
    <Shell
      title={formatDate(lesson.lesson_date, "long")}
      eyebrow={`${student.name} · lesson record`}
      back={{ href: `/students/${student.id}`, label: student.name }}
      tab="studio"
      actions={
        <Link href={`/lessons/${id}/edit`} className="text-sm font-medium text-accent-ink">
          Edit
        </Link>
      }
    >
      <div className="flex flex-col gap-5">
        {approved && (
          <Notice tone="sage">
            Approved. {student.name}&apos;s family can now see this plan in{" "}
            <Link href={`/family/${student.id}`} className="font-semibold underline">
              Home practice
            </Link>
            .
          </Notice>
        )}

        {isDraft ? (
          <Card tone="amber" className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <Pill tone="amber">Draft</Pill>
              <span className="text-sm">Parents can&apos;t see this yet. Read it over, then approve.</span>
            </div>
            <form action={approveLesson} className="flex gap-2">
              <input type="hidden" name="lesson_id" value={id} />
              <input type="hidden" name="student_id" value={student.id} />
              <Button variant="sage" className="flex-1">
                Approve and share with family
              </Button>
              <LinkButton href={`/lessons/${id}/edit`} variant="secondary">
                Edit
              </LinkButton>
            </form>
          </Card>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone="sage">Approved {lesson.approved_at ? formatDate(lesson.approved_at.slice(0, 10)) : ""}</Pill>
            <LinkButton href={`/lessons/${id}/sheet`} variant="secondary" className="min-h-9 px-3 text-sm">
              Print lesson sheet
            </LinkButton>
            <LinkButton href={`/family/${student.id}`} variant="ghost" className="min-h-9 px-3 text-sm">
              Parent view
            </LinkButton>
          </div>
        )}

        <Card className="divide-y divide-rule">
          {lesson.lesson_pieces.length > 0 && (
            <Row label="Pieces">
              <ul className="flex flex-col gap-1">
                {lesson.lesson_pieces.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-medium">{p.title}</span>
                    <span className="text-sm text-muted">{humanize(p.activity).toLowerCase()}</span>
                    {p.notes && <span className="w-full text-sm text-muted">{p.notes}</span>}
                  </li>
                ))}
              </ul>
            </Row>
          )}
          {lesson.summary && <Row label="Today we">{lesson.summary}</Row>}
          {lesson.focus_points && <Row label="Focus">{lesson.focus_points}</Row>}
          {lesson.parent_message && <Row label="To parent">{lesson.parent_message}</Row>}
          {(lesson.duration_minutes || lesson.next_lesson_date) && (
            <Row label="Details">
              {lesson.duration_minutes ? `${lesson.duration_minutes} minutes. ` : ""}
              {lesson.next_lesson_date ? `Next lesson ${formatDate(lesson.next_lesson_date, "weekday")}.` : ""}
            </Row>
          )}
        </Card>

        <section id="recordings" className="scroll-mt-4">
          <SectionTitle>Lesson video</SectionTitle>
          <div className="flex flex-col gap-3">
            <RecordingList recordings={recordings} editable />
            <RecordingUploader lessonId={id} autoOpen={!!upload} />
            {!isDraft && recordings.length > 0 && (
              <p className="text-sm text-muted">The family can watch these from Home practice.</p>
            )}
          </div>
        </section>

        <section id="timeline" className="scroll-mt-4">
          <SectionTitle
            action={
              <Link href={`/lessons/${id}/stand`} className="text-sm font-medium text-accent-ink">
                Open music stand
              </Link>
            }
          >
            Music &amp; video
          </SectionTitle>
          <LessonTimeline recordings={recordings} events={standEvents} scores={scores} />
        </section>

        <section>
          <SectionTitle>Practice assignments</SectionTitle>
          {lesson.assignments.length === 0 ? (
            <p className="text-sm text-muted">No assignments yet.</p>
          ) : (
            <AssignmentList assignments={lesson.assignments} />
          )}
        </section>

        {(lesson.suggestions || lesson.teacher_notes) && (
          <Card tone="plum" className="divide-y divide-plum/15">
            <div className="pb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-plum">Teacher only</div>
            {lesson.suggestions && <Row label="Next time">{lesson.suggestions}</Row>}
            {lesson.teacher_notes && <Row label="Notes">{lesson.teacher_notes}</Row>}
          </Card>
        )}

        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          {!isDraft && (
            <form action={unapproveLesson}>
              <input type="hidden" name="lesson_id" value={id} />
              <input type="hidden" name="student_id" value={student.id} />
              <button className="text-muted underline">Move back to draft</button>
            </form>
          )}
          <form action={deleteLesson} className="ml-auto">
            <input type="hidden" name="lesson_id" value={id} />
            <input type="hidden" name="student_id" value={student.id} />
            <button className="text-danger underline">Delete this record</button>
          </form>
        </div>
      </div>
    </Shell>
  );
}
