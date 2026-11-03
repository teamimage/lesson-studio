import type { ReactNode } from "react";
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
import { daysBetween, formatDate, humanize, todayISO } from "@/lib/format";
import { listPeriods } from "@/lib/practice/period";
import { PeriodReviewWriter } from "@/components/period-review-writer";
import { listArchivedForLesson, listRecordingsForLesson } from "@/lib/recordings";
import { ArchivedRecordings, RecordingList } from "@/components/recording-player";
import { RecordingUploader } from "@/components/recording-uploader";
import { ConsentNeeded } from "@/components/consent-needed";
import { getConsentStatus } from "@/lib/recording-consent-data";
import { LessonTimeline } from "@/components/lesson-timeline";
import { listScores, listStandEvents } from "@/lib/scores";
import { ProcessVideo } from "@/components/process-video";
import { getLessonAi } from "@/lib/ai/usage";
import { formatUsd } from "@/lib/ai/pricing";
import { LessonReview } from "@/components/lesson-review";
import { VideoPopupProvider } from "@/components/video-popup";
import { LinkMusic } from "@/components/link-music";
import { VoiceEditSection } from "@/components/voice-edit";
import {
  assignmentJumps,
  buildMoments,
  draftAssignmentTimes,
  lessonAiMoments,
  withClipInfo,
} from "@/lib/lesson-moments";
import { findSection, momentsKey, parseMusicLinks, viewerHref } from "@/lib/music-links";
import { applyBarMap } from "@/lib/bar-map";
import { pageRange } from "@/lib/score-analysis";
import { getUiVersion } from "@/lib/ui-version-server";
import { Fold } from "@/components/fold";

type Params = Promise<{ id: string }>;
type SP = Promise<{ approved?: string; upload?: string; video?: string }>;

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
  const { approved, upload, video } = await searchParams;
  const [lesson, recordings, archived, standEvents, ai, ui] = await Promise.all([
    getLesson(id),
    listRecordingsForLesson(id),
    listArchivedForLesson(id),
    listStandEvents(id),
    getLessonAi(id),
    getUiVersion(),
  ]);
  const proposed = ui === "proposed";
  if (!lesson) notFound();
  // A new lesson closes the practice period before it: write that review now
  // (quietly, in the background) so it is ready for the teacher and family.
  const fresh = lesson.status === "draft" && Math.abs(daysBetween(lesson.lesson_date, todayISO())) <= 1;
  const [student, scores, periods, consent] = await Promise.all([
    getStudent(lesson.student_id),
    listScores(lesson.student_id, { includeArchived: true }),
    fresh ? listPeriods(lesson.student_id, 2) : Promise.resolve([]),
    getConsentStatus(lesson.student_id),
  ]);
  if (!student) notFound();
  const isDraft = lesson.status === "draft";
  const closedPeriod = periods.find((p) => p.nextLesson === lesson.lesson_date && p.needsWriting);

  // Jumps into the video: music stand moments, plus the AI's timeline (from
  // its draft, or the "4:10 ..." lines older drafts put in the notes).
  // Main camera first, so music stand moments land on it where it covers them.
  const playable = recordings.filter((r) => r.url).sort((a, b) => Number(b.isMain) - Number(a.isMain));
  const aiRecording = playable.some((r) => r.id === ai.state.recordingId) ? ai.state.recordingId! : null;
  const aiMoments = lessonAiMoments(ai.draft, lesson.teacher_notes);
  // Which sheet music each AI clip is about (matched by Claude, see link-music).
  const musicLinks = parseMusicLinks(ai.draft);
  const musicLinked = !!musicLinks && musicLinks.key === momentsKey(aiMoments);
  const hasPieces = scores.some((s) => s.sections.length > 0);
  const canLinkMusic = !!aiRecording && aiMoments.length > 0 && !!ai.transcript && hasPieces;
  const allMoments = buildMoments({
    recordings: playable.map((r) => ({
      id: r.id,
      startedAt: r.started_at,
      durationSeconds: r.duration_seconds ? Number(r.duration_seconds) : null,
    })),
    events: standEvents,
    scoreTitles: Object.fromEntries(scores.map((s) => [s.id, s.title])),
    scoreSections: Object.fromEntries(scores.map((s) => [s.id, s.sections])),
    ai: aiRecording ? { recordingId: aiRecording, moments: aiMoments } : null,
    musicLinks: applyBarMap(musicLinks?.links ?? [], scores),
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
  // What each section reads like now, for the top of the hold-to-change panel.
  const piecesText = lesson.lesson_pieces
    .map((p) => `${p.title} (${humanize(p.activity).toLowerCase()})${p.notes ? `: ${p.notes}` : ""}`)
    .join("\n");
  const assignmentsText = lesson.assignments
    .map((a, i) => `${i + 1}. ${a.title}${a.how ? `: ${a.how}` : ""}`)
    .join("\n");
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
        studentId={student.id}
        scores={scores.map((s) => ({
          id: s.id,
          title: s.title,
          pages: s.pages.map((p) => ({ url: p.url, w: p.w, h: p.h })),
          sections: s.sections,
        }))}
        recordings={playable.map((r) => ({
          id: r.id,
          lessonId: r.lesson_id,
          url: r.url,
          streamReady: r.streamReady,
          name: r.label || r.file_name,
          startedAt: r.started_at,
          isMain: r.isMain,
        }))}
      >
        <div className="flex flex-col gap-5">
          {proposed && (
            <LessonStatus
              lessonId={id}
              studentId={student.id}
              hasVideo={recordings.length > 0}
              aiStatus={ai.state.status}
              hasNotes={!!(lesson.summary || lesson.focus_points || lesson.assignments.length > 0)}
              isDraft={isDraft}
              canUpload={consent.state === "signed"}
            />
          )}
          {isDraft && !proposed && (
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
              {video === "main-setup" && (
                <Card tone="amber" className="text-sm">
                  The main camera wasn&apos;t saved. Run multi-angle.sql in the Supabase SQL Editor first, then try
                  again.
                </Card>
              )}
              {video === "setup" && (
                <Card tone="amber" className="text-sm">
                  The video wasn&apos;t deleted. Run archived-videos.sql in the Supabase SQL Editor first, so the
                  original can be kept, then try again.
                </Card>
              )}
              <RecordingList recordings={recordings} editable />
              {!proposed && <ArchivedRecordings recordings={archived} />}
              {!isDraft && !proposed && (
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
              {closedPeriod && <PeriodReviewWriter studentId={student.id} start={closedPeriod.start} auto quiet />}
              {consent.state === "signed" ? (
                <RecordingUploader lessonId={id} autoOpen={!!upload} />
              ) : (
                <ConsentNeeded
                  studentId={student.id}
                  studentName={student.name}
                  state={consent.state}
                  next={`/lessons/${id}?upload=1#recordings`}
                  what="uploading a video"
                />
              )}
              <ProcessVideo
                // Remount when the server state moves (e.g. processing started on upload).
                key={`${ai.state.status}-${ai.state.recordingId ?? ""}`}
                lessonId={id}
                isDraft={isDraft}
                initial={ai.state}
                mainId={recordings.find((r) => r.isMain && r.status === "ready")?.id ?? null}
                recordings={recordings
                  .filter((r) => r.status === "ready")
                  .map((r) => ({
                    id: r.id,
                    name: r.label || r.file_name,
                    sizeBytes: r.size_bytes,
                    durationSeconds: r.duration_seconds,
                  }))}
              />
              {!proposed && (ai.transcript || ai.costUsd > 0) && (
                <details className="rounded-2xl border border-rule bg-sheet px-4 py-3 text-sm">
                  <summary className="cursor-pointer font-medium">
                    Transcript
                    {ai.costUsd > 0 ? ` · AI cost for this lesson ${formatUsd(ai.costUsd)}` : ""}
                  </summary>
                  {ai.transcript ? (
                    <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap font-sans text-[14px] leading-relaxed text-muted">
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
              <VoiceEditSection lessonId={id} section="pieces" current={piecesText}>
                <Row label="Pieces">
                  <ul className="flex flex-col gap-1">
                    {lesson.lesson_pieces.map((p) => {
                      const found = findSection(scores, p.title);
                      return (
                        <li key={p.id} className="flex flex-wrap items-baseline gap-x-2">
                          <span className="font-medium">{p.title}</span>
                          {found && (
                            <Link
                              href={viewerHref(student.id, found.score.id, {
                                from: found.section.start_page,
                                to: found.section.end_page,
                              })}
                              className="text-sm text-accent-ink underline"
                            >
                              ♪ Music, {pageRange(found.section)}
                            </Link>
                          )}
                          <span className="text-sm text-muted">{humanize(p.activity).toLowerCase()}</span>
                          {p.notes && <span className="w-full text-sm text-muted">{p.notes}</span>}
                        </li>
                      );
                    })}
                  </ul>
                </Row>
              </VoiceEditSection>
            )}
            {lesson.summary && (
              <VoiceEditSection lessonId={id} section="summary" current={lesson.summary}>
                <Row label="Today we">{lesson.summary}</Row>
              </VoiceEditSection>
            )}
            {lesson.focus_points && (
              <VoiceEditSection lessonId={id} section="focus_points" current={lesson.focus_points}>
                <Row label="Focus">{lesson.focus_points}</Row>
              </VoiceEditSection>
            )}
            {lesson.parent_message && (
              <VoiceEditSection lessonId={id} section="parent_message" current={lesson.parent_message}>
                <Row label="To parent">{lesson.parent_message}</Row>
              </VoiceEditSection>
            )}
            {(lesson.duration_minutes || lesson.next_lesson_date) && (
              <Row label="Details">
                {lesson.duration_minutes ? `${lesson.duration_minutes} minutes. ` : ""}
                {lesson.next_lesson_date ? `Next lesson ${formatDate(lesson.next_lesson_date, "weekday")}.` : ""}
              </Row>
            )}
          </Card>
          <p className="-mt-3 px-1 text-xs text-muted">
            Hold any section of the notes to change it by voice or typing.
          </p>

          {moments.length > 0 && (
            <section id="review" className="scroll-mt-4">
              <SectionTitle
                action={
                  canLinkMusic && !proposed ? (
                    <LinkMusic
                      lessonId={id}
                      linked={musicLinked}
                      autoStart={!musicLinked && ai.state.status === "done"}
                    />
                  ) : undefined
                }
              >
                Lesson review
              </SectionTitle>
              <LessonReview moments={moments} multiVideo={videoNames} />
            </section>
          )}

          <section>
            <SectionTitle>Practice assignments</SectionTitle>
            <VoiceEditSection lessonId={id} section="assignments" current={assignmentsText}>
              {lesson.assignments.length === 0 ? (
                <p className="py-1 text-sm text-muted">No assignments yet. Hold here to add some by voice.</p>
              ) : (
                <AssignmentList assignments={lesson.assignments} jumps={jumps} />
              )}
            </VoiceEditSection>
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
              <div className="pb-1 text-[12px] font-semibold uppercase tracking-[0.12em] text-plum">Teacher only</div>
              {lesson.suggestions && (
                <VoiceEditSection lessonId={id} section="suggestions" current={lesson.suggestions}>
                  <Row label="Next time">{lesson.suggestions}</Row>
                </VoiceEditSection>
              )}
              {lesson.teacher_notes && (
                <VoiceEditSection lessonId={id} section="teacher_notes" current={lesson.teacher_notes}>
                  <Row label="Notes">{lesson.teacher_notes}</Row>
                </VoiceEditSection>
              )}
            </Card>
          )}

          {proposed ? (
            <Fold title="More tools" meta="music links, old videos, transcript, delete">
              {canLinkMusic && (
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <span className="text-muted">Match the review clips to the sheet music:</span>
                  <LinkMusic lessonId={id} linked={musicLinked} autoStart={!musicLinked && ai.state.status === "done"} />
                </div>
              )}
              <ArchivedRecordings recordings={archived} />
              {(ai.transcript || ai.costUsd > 0) && (
                <details className="rounded-2xl border border-rule bg-sheet px-4 py-3 text-sm">
                  <summary className="cursor-pointer font-medium">
                    Transcript
                    {ai.costUsd > 0 ? ` · AI cost for this lesson ${formatUsd(ai.costUsd)}` : ""}
                  </summary>
                  {ai.transcript ? (
                    <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap font-sans text-[14px] leading-relaxed text-muted">
                      {ai.transcript}
                    </pre>
                  ) : (
                    <p className="mt-2 text-muted">No transcript yet.</p>
                  )}
                </details>
              )}
              <div className="flex flex-wrap gap-3 text-sm">
                <Link href={`/lessons/${id}/sheet`} className="text-accent-ink underline">
                  Print lesson sheet
                </Link>
                <Link href={`/lessons/${id}/edit`} className="text-accent-ink underline">
                  Edit as a form
                </Link>
              </div>
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
            </Fold>
          ) : (
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
          )}
        </div>
      </VideoPopupProvider>
    </Shell>
  );
}

type AiStatus = "none" | "transcribing" | "drafting" | "done" | "error";

// Proposed version: where this lesson stands, and the one thing to do next.
function LessonStatus({
  lessonId,
  studentId,
  hasVideo,
  aiStatus,
  hasNotes,
  isDraft,
  canUpload,
}: {
  lessonId: string;
  studentId: string;
  hasVideo: boolean;
  aiStatus: AiStatus;
  hasNotes: boolean;
  isDraft: boolean;
  canUpload: boolean;
}) {
  const processing = aiStatus === "transcribing" || aiStatus === "drafting";
  const steps: { label: string; state: "done" | "now" | "todo" }[] = [
    { label: "Video", state: hasVideo ? "done" : hasNotes ? "done" : "now" },
    {
      label: "Processed",
      state: aiStatus === "done" || (!hasVideo && hasNotes) ? "done" : hasVideo ? "now" : "todo",
    },
    { label: "Draft ready", state: hasNotes ? "done" : processing ? "now" : "todo" },
    { label: "Approved", state: !isDraft ? "done" : hasNotes ? "now" : "todo" },
    { label: "Family can see", state: !isDraft ? "done" : "todo" },
  ];

  let next: ReactNode;
  if (!isDraft) {
    next = (
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-medium text-sage">✓ Done. The family can see this lesson.</span>
        <LinkButton href={`/family/${studentId}`} variant="secondary" className="text-sm">
          Parent view
        </LinkButton>
      </div>
    );
  } else if (hasNotes && (!hasVideo || aiStatus === "done" || aiStatus === "error" || aiStatus === "none")) {
    next = (
      <form action={approveLesson} className="flex flex-wrap gap-2">
        <input type="hidden" name="lesson_id" value={lessonId} />
        <input type="hidden" name="student_id" value={studentId} />
        <Button variant="sage" className="min-h-12 flex-1 text-[17px]">
          Read it over, then approve and share
        </Button>
      </form>
    );
  } else if (processing) {
    next = <p className="text-[16px]">The video is being processed. The draft appears here in a few minutes.</p>;
  } else if (hasVideo) {
    next = (
      <LinkButton href="#recordings" className="min-h-12 text-[17px]">
        Next: process the video ↓
      </LinkButton>
    );
  } else {
    next = canUpload ? (
      <LinkButton href={`/lessons/${lessonId}?upload=1#recordings`} className="min-h-12 text-[17px]">
        Next: upload the lesson video
      </LinkButton>
    ) : (
      <p className="text-[16px]">Collect recording consent first (below), then upload the video.</p>
    );
  }

  return (
    <Card tone={isDraft ? "amber" : "sage"} className="flex flex-col gap-3">
      <ol className="flex flex-wrap gap-x-1 gap-y-2 text-sm" aria-label="Lesson progress">
        {steps.map((st, i) => (
          <li key={st.label} className="flex items-center gap-1">
            <span
              className={
                st.state === "done"
                  ? "rounded-full bg-sage-soft px-2.5 py-1 font-semibold text-sage"
                  : st.state === "now"
                    ? "rounded-full bg-accent-soft px-2.5 py-1 font-semibold text-accent-ink ring-2 ring-accent/40"
                    : "rounded-full bg-rule/60 px-2.5 py-1 text-muted"
              }
            >
              {st.state === "done" ? "✓ " : ""}
              {st.label}
            </span>
            {i < steps.length - 1 && (
              <span aria-hidden className="text-muted">
                ›
              </span>
            )}
          </li>
        ))}
      </ol>
      {next}
    </Card>
  );
}
