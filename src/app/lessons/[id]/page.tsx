import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Shell } from "@/components/shell";
import { LocalDateTime } from "@/components/local-time";
import { AssignmentList } from "@/components/assignment-list";
import { Button, Card, LinkButton, Pill, Row, SectionTitle } from "@/components/ui";
import { approveLesson, deleteLesson, unapproveLesson } from "@/app/lessons/actions";
import { requireTeacher } from "@/lib/auth";
import { getLesson, getStudent } from "@/lib/data";
import { formatDate, humanize } from "@/lib/format";
import { listRecordingsForLesson } from "@/lib/recordings";
import { RecordingList } from "@/components/recording-player";
import { RecordingUploader } from "@/components/recording-uploader";
import { LessonTimeline } from "@/components/lesson-timeline";
import { listScores, listStandEvents } from "@/lib/scores";
import { ProcessVideo } from "@/components/process-video";
import { getLessonAi } from "@/lib/ai/usage";
import { formatUsd } from "@/lib/ai/pricing";
import { LessonReview } from "@/components/lesson-review";
import { VideoPopupProvider } from "@/components/video-popup";
import {
  assignmentJumps,
  buildMoments,
  draftAssignmentTimes,
  draftMoments,
  parseTimelineText,
  withClipInfo,
} from "@/lib/lesson-moments";

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
  const [lesson, recordings, standEvents, ai] = await Promise.all([
    getLesson(id),
    listRecordingsForLesson(id),
    listStandEvents(id),
    getLessonAi(id),
  ]);
  if (!lesson) notFound();
  const [student, scores] = await Promise.all([
    getStudent(lesson.student_id),
    standEvents.length ? listScores(lesson.student_id, { includeArchived: true }) : Promise.resolve([]),
  ]);
  if (!student) notFound();
  const isDraft = lesson.status === "draft";

  // Jumps into the video: music stand moments, plus the AI's timeline (from
  // its draft, or the "4:10 ..." lines older drafts put in the notes).
  const playable = recordings.filter((r) => r.url);
  const aiRecording = playable.some((r) => r.id === ai.state.recordingId) ? ai.state.recordingId! : null;
  const fromDraft = draftMoments(ai.draft);
  const aiMoments = fromDraft.length ? fromDraft : parseTimelineText(lesson.teacher_notes);
  const allMoments = buildMoments({
    recordings: playable.map((r) => ({
      id: r.id,
      startedAt: r.started_at,
      durationSeconds: r.duration_seconds ? Number(r.duration_seconds) : null,
    })),
    events: standEvents,
    scoreTitles: Object.fromEntries(scores.map((s) => [s.id, s.title])),
    ai: aiRecording ? { recordingId: aiRecording, moments: aiMoments } : null,
  });
  const { moments, jumps } = withClipInfo(
    allMoments,
    assignmentJumps(
      lesson.assignments,
      allMoments,
      aiRecording ? { recordingId: aiRecording, times: draftAssignmentTimes(ai.draft) } : null,
    ),
    lesson.assignments,
    lesson.lesson_pieces,
  );
  const videoNames =
    playable.length > 1 ? Object.fromEntries(playable.map((r) => [r.id, r.label || r.file_name])) : undefined;

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
      <VideoPopupProvider
        recordings={playable.map((r) => ({
          id: r.id,
          url: r.url,
          streamReady: r.streamReady,
          name: r.label || r.file_name,
        }))}
      >
        <div className="flex flex-col gap-5">
          {isDraft && (
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
          )}

          <section id="recordings" className="scroll-mt-4">
            <SectionTitle>Lesson video</SectionTitle>
            <div className="flex flex-col gap-3">
              <RecordingList recordings={recordings} editable />
              {!isDraft && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  <span className="text-sage">
                    ✓ Approved
                    {lesson.approved_at && (
                      <>
                        {" "}
                        <LocalDateTime iso={lesson.approved_at} />
                      </>
                    )}
                    {approved && " · the family can see it now"}
                  </span>
                  <Link href={`/lessons/${id}/sheet`} className="text-accent-ink underline">
                    Print lesson sheet
                  </Link>
                  <Link href={`/family/${student.id}`} className="text-accent-ink underline">
                    Parent view
                  </Link>
                </div>
              )}
              <RecordingUploader lessonId={id} autoOpen={!!upload} />
              <ProcessVideo
                // Remount when the server state moves (e.g. processing started on upload).
                key={`${ai.state.status}-${ai.state.recordingId ?? ""}`}
                lessonId={id}
                isDraft={isDraft}
                initial={ai.state}
                recordings={recordings
                  .filter((r) => r.status === "ready")
                  .map((r) => ({
                    id: r.id,
                    name: r.label || r.file_name,
                    sizeBytes: r.size_bytes,
                    durationSeconds: r.duration_seconds,
                  }))}
              />
              {(ai.transcript || ai.costUsd > 0) && (
                <details className="rounded-2xl border border-rule bg-sheet px-4 py-3 text-sm">
                  <summary className="cursor-pointer font-medium">
                    Transcript{ai.costUsd > 0 ? ` · AI cost for this lesson ${formatUsd(ai.costUsd)}` : ""}
                  </summary>
                  {ai.transcript ? (
                    <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap font-sans text-[13px] leading-relaxed text-muted">
                      {ai.transcript}
                    </pre>
                  ) : (
                    <p className="mt-2 text-muted">No transcript yet.</p>
                  )}
                </details>
              )}
              {!isDraft && recordings.length > 0 && (
                <p className="text-sm text-muted">The family can watch these from Home practice.</p>
              )}
            </div>
          </section>

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

          {moments.length > 0 && (
            <section id="review" className="scroll-mt-4">
              <SectionTitle>Lesson review</SectionTitle>
              <LessonReview moments={moments} multiVideo={videoNames} />
            </section>
          )}

          <section>
            <SectionTitle>Practice assignments</SectionTitle>
            {lesson.assignments.length === 0 ? (
              <p className="text-sm text-muted">No assignments yet.</p>
            ) : (
              <AssignmentList assignments={lesson.assignments} jumps={jumps} />
            )}
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
      </VideoPopupProvider>
    </Shell>
  );
}
