import { listScoreIndex } from "@/lib/scores";
import { MusicPreviewLinks } from "@/components/music-preview-links";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Shell } from "@/components/shell";
import { Avatar } from "@/components/avatar";
import { InstrumentTag } from "@/components/instrument-tag";
import { studentPhotoSrc } from "@/lib/constants";
import { Button, Card, LinkButton } from "@/components/ui";
import { AutoRefresh, ClockTime, LessonTimer } from "@/components/lesson-clock";
import { requireTeacher } from "@/lib/auth";
import { getLesson, getStudent } from "@/lib/data";
import { formatDate } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { endLesson } from "@/app/lessons/live-actions";

type Params = Promise<{ id: string }>;

// The lesson card: what Start lesson opens. The teacher's phone keeps it open
// during the lesson; it shows the clock and whether the music stand is running.
export default function LiveLessonPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<Shell title=" " tab="studio">{null}</Shell>}>
      <Body params={params} />
    </Suspense>
  );
}

async function Body({ params }: { params: Params }) {
  await requireTeacher();
  const { id } = await params;
  const lesson = await getLesson(id);
  if (!lesson) notFound();
  const student = await getStudent(lesson.student_id);
  if (!student) notFound();

  const supabase = await createClient();
  const [{ data: events }, { data: recs }] = await Promise.all([
    supabase.from("stand_events").select("kind, score_id, page, at").eq("lesson_id", id).order("at"),
    supabase.from("recordings").select("*").eq("lesson_id", id),
  ]);
  const music = await listScoreIndex(student.id);
  const videos = (recs ?? []).filter((r) => !r.archived_at).length;
  const standEvents = events ?? [];
  const firstStand = standEvents[0] ?? null;
  const lastStand = standEvents[standEvents.length - 1] ?? null;
  const standEnded = lastStand?.kind === "end";
  let pieceTitle: string | null = null;
  if (lastStand?.kind === "open" && lastStand.score_id) {
    const { data: score } = await supabase.from("scores").select("title").eq("id", lastStand.score_id).maybeSingle();
    pieceTitle = score?.title ?? null;
  }

  const firstName = student.name.trim().split(/\s+/)[0] || student.name;
  const ended = lesson.duration_minutes != null;

  return (
    <Shell
      title={
        <span className="flex items-center gap-3">
          <Avatar name={student.name} instrument={student.instrument} photoSrc={studentPhotoSrc(student)} />
          <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            {`${firstName}'s lesson`}
            <InstrumentTag instrument={student.instrument} />
          </span>
        </span>
      }
      eyebrow={formatDate(lesson.lesson_date, "long")}
      back={{ href: `/students/${student.id}`, label: student.name }}
      tab="studio"
    >
      {!ended && <AutoRefresh />}
      <div className="flex flex-col gap-5">
        <Card className="flex items-end justify-between gap-3">
          <div>
            <div className="text-sm text-muted">
              Started <ClockTime iso={lesson.created_at} />
            </div>
            {ended ? (
              <div className="font-display text-4xl font-medium">{lesson.duration_minutes} min</div>
            ) : (
              <LessonTimer startedAt={lesson.created_at} className="font-display text-5xl font-medium tabular-nums" />
            )}
          </div>
          <div className="pb-1 text-sm text-muted">{ended ? "Ended" : "In progress"}</div>
        </Card>

        <Card className="flex flex-col gap-3 text-[15px]">
          <Status
            ok={!!firstStand && !standEnded}
            label="Music stand"
            text={
              !firstStand ? (
                <>Not open yet. On the iPad, open this lesson and tap Music stand.</>
              ) : standEnded ? (
                <>Closed.</>
              ) : (
                <>
                  Open since <ClockTime iso={firstStand.at} />
                  {pieceTitle ? (
                    <>
                      {" "}
                      · on <span className="font-medium">{pieceTitle}</span>
                      {lastStand?.page ? `, page ${lastStand.page}` : ""}
                    </>
                  ) : (
                    " · no piece open"
                  )}
                </>
              )
            }
          />
          <Status
            ok={(videos ?? 0) > 0}
            label="Video"
            text={
              videos ? (
                `${videos} video${videos === 1 ? "" : "s"} uploaded`
              ) : (
                <>Record on the iPhone, then upload it here after the lesson.</>
              )
            }
          />
        </Card>

        <div className="grid grid-cols-2 gap-2">
          <LinkButton href={`/lessons/${id}/stand`} className="col-span-2 min-h-14 text-lg">
            Music stand
          </LinkButton>
          <MusicPreviewLinks studentId={student.id} scores={music} className="col-span-2 px-1" />
          <LinkButton href={`/lessons/${id}?upload=1#recordings`} variant="secondary">
            Upload video
          </LinkButton>
          <LinkButton href={`/lessons/${id}`} variant="secondary">
            Lesson notes
          </LinkButton>
          {!ended && (
            <form action={endLesson} className="col-span-2">
              <input type="hidden" name="lesson_id" value={id} />
              <Button variant="secondary" className="w-full">
                End lesson
              </Button>
            </form>
          )}
        </div>
      </div>
    </Shell>
  );
}

function Status({ ok, label, text }: { ok: boolean; label: string; text: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <span
        aria-hidden
        className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${ok ? "bg-sage" : "bg-rule"}`}
      />
      <div>
        <div className="font-semibold">{label}</div>
        <div className="text-muted">{text}</div>
      </div>
    </div>
  );
}
