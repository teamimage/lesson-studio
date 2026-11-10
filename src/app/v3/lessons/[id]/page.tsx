import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Shell } from "@/components/shell";
import { Me } from "@/components/v3/me";
import { LessonStoryProvider, StoryMoments } from "@/components/v3/lesson-story";
import { LocalDateTime } from "@/components/local-time";
import { AssignmentList } from "@/components/assignment-list";
import { Button, Card, LinkButton, Pill, Row, SectionTitle } from "@/components/ui";
import { approveLesson, deleteLesson, unapproveLesson } from "@/app/lessons/actions";
import { requireTeacher } from "@/lib/auth";
import { getLesson, getStudent } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { reconcileLengths } from "@/lib/lesson-length";
import { LengthFlag } from "@/components/length-flag";
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
import { LinkMusic } from "@/components/link-music";
import { VoiceEditSection } from "@/components/voice-edit";
import { Fold } from "@/components/fold";
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

type Params = Promise<{ id: string }>;
type SP = Promise<{ approved?: string; upload?: string; video?: string }>;

// Version 3 lesson page: one scrolling story. The video stays in view; the
// summary, every moment of the lesson (with what was said), the home
// practice and the teacher's notes read top to bottom, and tapping any of
// them plays that clip in place with its bars highlighted.
export default function V3LessonPage({ params, searchParams }: { params: Params; searchParams: SP }) {
  return (
    <Suspense fallback={<Shell title="Lesson" v3Tab="students" me={<Me />} wide>{null}</Shell>}>
      <Body params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Body({ params, searchParams }: { params: Params; searchParams: SP }) {
  await requireTeacher();
  const { id } = await params;
  // The length follows the video (Cloudflare's reading is trusted); flagged when it can't be read.
  const lengthCheck = (await reconcileLengths(await createClient(), [id], { checkCloudflare: true }))[id];
  const { approved, upload, video } = await searchParams;
  const [lesson, recordings, archived, standEvents, ai] = await Promise.all([
    getLesson(id),
    listRecordingsForLesson(id),
    listArchivedForLesson(id),
    listStandEvents(id),
    getLessonAi(id),
  ]);
  if (!lesson) notFound();
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

  // Same moments as the other versions (music stand + AI timeline + bar map).
  const playable = recordings.filter((r) => r.url || r.streamReady).sort((a, b) => Number(b.isMain) - Number(a.isMain));
  const aiRecording = playable.some((r) => r.id === ai.state.recordingId) ? ai.state.recordingId! : null;
  const aiMoments = lessonAiMoments(ai.draft, lesson.teacher_notes);
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
  const piecesText = lesson.lesson_pieces
    .map((p) => `${p.title} (${humanize(p.activity).toLowerCase()})${p.notes ? `: ${p.notes}` : ""}`)
    .join("\n");
  const assignmentsText = lesson.assignments.map((a, i) => `${i + 1}. ${a.title}${a.how ? `: ${a.how}` : ""}`).join("\n");
  const videoNames =
    playable.length > 1 ? Object.fromEntries(playable.map((r) => [r.id, r.label || r.file_name])) : undefined;
  const viewerScores = scores.map((s) => ({
    id: s.id,
    title: s.title,
    pages: s.pages.map((p) => ({ url: p.url, w: p.w, h: p.h })),
    sections: s.sections,
  }));
  const processing = ai.state.status === "transcribing" || ai.state.status === "drafting";
  const hasNotes = !!(lesson.summary || lesson.focus_points || lesson.assignments.length > 0);
  const needsVideoWork = recordings.length === 0 || (ai.state.status !== "done" && !hasNotes) || processing;

  return (
    <Shell
      title={formatDate(lesson.lesson_date, "long")}
      eyebrow={`${student.name} · lesson story`}
      back={{ href: `/v3/students/${student.id}`, label: student.name }}
      v3Tab="students"
      me={<Me />}
      wide
      actions={
        <Link href={`/lessons/${id}/edit`} className="text-sm font-medium text-accent-ink">
          Edit
        </Link>
      }
    >
      <LessonStoryProvider
        studentId={student.id}
        scores={viewerScores}
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
        {/* Where it stands and the one next step */}
        {isDraft ? (
          <Card tone="amber" className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Pill tone="amber">Draft</Pill>
              <span className="text-[16px]">
                {processing
                  ? "The video is being processed. The write-up appears here in a few minutes."
                  : hasNotes
                    ? "The family can't see this yet. Read the story, then approve."
                    : recordings.length
                      ? "Process the video to write this lesson up."
                      : "Upload the lesson video, or write it up by hand."}
              </span>
            </div>
            {hasNotes && !processing && (
              <form action={approveLesson}>
                <input type="hidden" name="lesson_id" value={id} />
                <input type="hidden" name="student_id" value={student.id} />
                <Button variant="sage" className="min-h-12 w-full text-[17px]">
                  Approve and share with the family
                </Button>
              </form>
            )}
          </Card>
        ) : (
          <Card tone="sage" className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[16px]">
            <span className="font-medium text-sage">
              ✓ Approved
              {lesson.approved_at && (
                <>
                  {" "}
                  <LocalDateTime iso={lesson.approved_at} />
                </>
              )}
              {approved ? " · the family can see it now" : ""}
            </span>
            <Link href={`/v3/family/${student.id}`} className="text-plum underline">
              Family mode
            </Link>
            <Link href={`/lessons/${id}/sheet`} className="text-accent-ink underline">
              Print sheet
            </Link>
          </Card>
        )}
        <LengthFlag check={lengthCheck} lessonId={id} studentId={student.id} />
        {closedPeriod && <PeriodReviewWriter studentId={student.id} start={closedPeriod.start} auto quiet />}

        {/* The summary */}
        {(lesson.summary || lesson.focus_points || lesson.lesson_pieces.length > 0 || lesson.parent_message) && (
          <section>
            <SectionTitle>What happened</SectionTitle>
            <Card className="divide-y divide-rule text-[17px]">
              {lesson.summary && (
                <VoiceEditSection lessonId={id} section="summary" current={lesson.summary}>
                  <Row label="Today we">{lesson.summary}</Row>
                </VoiceEditSection>
              )}
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
                                ♪ {pageRange(found.section)}
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
            </Card>
            <p className="mt-1 px-1 text-xs text-muted">Hold any part to change it by voice or typing.</p>
          </section>
        )}

        {/* Moment by moment */}
        {moments.length > 0 && (
          <section>
            <SectionTitle
              action={
                canLinkMusic && !musicLinked ? (
                  <LinkMusic lessonId={id} linked={musicLinked} autoStart={ai.state.status === "done"} />
                ) : undefined
              }
            >
              Moment by moment
            </SectionTitle>
            <StoryMoments
              moments={moments}
              transcript={ai.transcript}
              transcriptRecordingId={aiRecording}
              scores={viewerScores}
              studentId={student.id}
              multiVideo={videoNames}
            />
          </section>
        )}

        {/* Home practice */}
        <section>
          <SectionTitle>Home practice</SectionTitle>
          <VoiceEditSection lessonId={id} section="assignments" current={assignmentsText}>
            {lesson.assignments.length === 0 ? (
              <p className="py-1 text-[16px] text-muted">No assignments yet. Hold here to add some by voice.</p>
            ) : (
              <AssignmentList assignments={lesson.assignments} jumps={jumps} />
            )}
          </VoiceEditSection>
        </section>

        {(lesson.suggestions || lesson.teacher_notes || lesson.duration_minutes || lesson.next_lesson_date) && (
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
            {(lesson.duration_minutes || lesson.next_lesson_date) && (
              <Row label="Details">
                {lesson.duration_minutes
                  ? `${lesson.duration_minutes} minutes${lesson.duration_source === "video" ? " (from the video)" : ""}. `
                  : ""}
                {lesson.next_lesson_date ? `Next lesson ${formatDate(lesson.next_lesson_date, "weekday")}.` : ""}
              </Row>
            )}
          </Card>
        )}

        {/* Video files, processing and the rarer tools, folded away once done */}
        <section id="recordings" className="scroll-mt-28">
          <Fold
            title="Video & processing"
            meta={`${recordings.length} video${recordings.length === 1 ? "" : "s"}${ai.costUsd > 0 ? ` · AI ${formatUsd(ai.costUsd)}` : ""}`}
            open={needsVideoWork || !!upload || !!video}
          >
            {video === "main-setup" && (
              <Card tone="amber" className="text-sm">
                The main camera wasn&apos;t saved. Run multi-angle.sql in the Supabase SQL Editor first, then try again.
              </Card>
            )}
            {video === "setup" && (
              <Card tone="amber" className="text-sm">
                The video wasn&apos;t deleted. Run archived-videos.sql in the Supabase SQL Editor first, then try again.
              </Card>
            )}
            <RecordingList recordings={recordings} editable />
            {consent.state === "signed" ? (
              <RecordingUploader lessonId={id} autoOpen={!!upload} />
            ) : (
              <ConsentNeeded
                studentId={student.id}
                studentName={student.name}
                state={consent.state}
                next={`/v3/lessons/${id}?upload=1#recordings`}
                what="uploading a video"
              />
            )}
            <ProcessVideo
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
          </Fold>
        </section>

        <Fold title="More tools" meta="music stand log, whole transcript, old videos, delete">
          {canLinkMusic && musicLinked && (
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="text-muted">Clips are matched to the music.</span>
              <LinkMusic lessonId={id} linked={musicLinked} autoStart={false} />
            </div>
          )}
          <div>
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="font-semibold">Music stand log</span>
              <Link href={`/lessons/${id}/stand`} className="text-sm font-medium text-accent-ink">
                Open music stand
              </Link>
            </div>
            <LessonTimeline recordings={recordings} events={standEvents} scores={scores} />
          </div>
          {ai.transcript && (
            <details className="rounded-2xl border border-rule bg-sheet px-4 py-3 text-sm">
              <summary className="cursor-pointer font-medium">Whole transcript</summary>
              <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap font-sans text-[14px] leading-relaxed text-muted">
                {ai.transcript}
              </pre>
            </details>
          )}
          <ArchivedRecordings recordings={archived} />
          <div className="flex flex-wrap gap-3 text-sm">
            <Link href={`/lessons/${id}/sheet`} className="text-accent-ink underline">
              Print lesson sheet
            </Link>
            <Link href={`/lessons/${id}/edit`} className="text-accent-ink underline">
              Edit as a form
            </Link>
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
        {!isDraft && recordings.length > 0 && (
          <LinkButton href={`/v3/family/${student.id}`} variant="secondary" className="self-start">
            See what the family sees
          </LinkButton>
        )}
      </LessonStoryProvider>
    </Shell>
  );
}
