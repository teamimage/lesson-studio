import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Shell } from "@/components/shell";
import { Button, Card, EmptyState, Pill, SectionTitle } from "@/components/ui";
import { ScoreUploader } from "@/components/score-uploader";
import { requireTeacher } from "@/lib/auth";
import { getStudent, listRepertoire } from "@/lib/data";
import { listScores } from "@/lib/scores";
import { SCORE_KINDS } from "@/lib/constants";
import type { StandScore } from "@/lib/stand-timeline";
import { deleteScore, moveScore, openMusicStand, renameScore, setScoreArchived } from "@/app/students/music-actions";

type Params = Promise<{ id: string }>;

export default function MusicPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<Shell title="Music" tab="studio">{null}</Shell>}>
      <Body params={params} />
    </Suspense>
  );
}

async function Body({ params }: { params: Params }) {
  await requireTeacher();
  const { id } = await params;
  const student = await getStudent(id);
  if (!student) notFound();
  const [scores, repertoire] = await Promise.all([listScores(id, { includeArchived: true }), listRepertoire(id)]);
  const active = scores.filter((s) => !s.archived);
  const archived = scores.filter((s) => s.archived);
  const suggestions = [...new Set(repertoire.map((r) => r.title))].filter(
    (t) => !scores.some((s) => s.title.toLowerCase() === t.toLowerCase()),
  );

  return (
    <Shell
      title="Music"
      eyebrow={`${student.name} · music stand`}
      back={{ href: `/students/${id}`, label: student.name }}
      tab="studio"
    >
      <div className="flex flex-col gap-6">
        <Card tone="accent" className="flex flex-col gap-3">
          <p className="text-[15px]">
            Put {student.name}&apos;s music here, then open the music stand on the iPad (or a phone or laptop) during the
            lesson. It notes which piece and page is open, so the lesson video can be split by piece.
          </p>
          <form action={openMusicStand}>
            <input type="hidden" name="student_id" value={id} />
            <Button className="w-full" disabled={active.length === 0}>
              Open the music stand for today&apos;s lesson
            </Button>
          </form>
        </Card>

        <section>
          <SectionTitle>On the stand ({active.length})</SectionTitle>
          {active.length === 0 ? (
            <EmptyState title="No music yet">Add the pieces, exercises and scales being worked on below.</EmptyState>
          ) : (
            <ul className="flex flex-col gap-2">
              {active.map((s, i) => (
                <ScoreRow key={s.id} score={s} first={i === 0} last={i === active.length - 1} />
              ))}
            </ul>
          )}
        </section>

        <section>
          <SectionTitle>Add music</SectionTitle>
          <Card>
            <ScoreUploader studentId={id} suggestions={suggestions} />
          </Card>
        </section>

        {archived.length > 0 && (
          <section>
            <SectionTitle>Put away ({archived.length})</SectionTitle>
            <ul className="flex flex-col gap-2">
              {archived.map((s) => (
                <ScoreRow key={s.id} score={s} first last />
              ))}
            </ul>
          </section>
        )}
      </div>
    </Shell>
  );
}

function ScoreRow({ score, first, last }: { score: StandScore; first: boolean; last: boolean }) {
  const cover = score.pages[0];
  const kind = SCORE_KINDS.find((k) => k.value === score.kind)?.label ?? score.kind;
  return (
    <li className="flex gap-3 rounded-2xl border border-rule bg-sheet p-3">
      <div className="h-24 w-[72px] shrink-0 overflow-hidden rounded-lg border border-rule bg-white">
        {cover?.url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover.url} alt="" className="h-full w-full object-cover object-top" loading="lazy" />
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <form action={renameScore} className="flex items-center gap-2">
          <input type="hidden" name="score_id" value={score.id} />
          <input
            name="title"
            defaultValue={score.title}
            className="min-h-9 min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-1 font-semibold hover:border-rule focus:border-accent focus:bg-paper"
          />
          <button className="text-sm font-medium text-accent-ink">Save</button>
        </form>
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
          <Pill tone="accent">{kind}</Pill>
          {score.pages.length} page{score.pages.length === 1 ? "" : "s"}
          {score.pages.length === 0 && <Pill tone="amber">Upload didn&apos;t finish</Pill>}
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          {!score.archived && !first && (
            <form action={moveScore}>
              <input type="hidden" name="score_id" value={score.id} />
              <input type="hidden" name="dir" value="up" />
              <button className="text-accent-ink" aria-label="Move up">
                ↑ Up
              </button>
            </form>
          )}
          {!score.archived && !last && (
            <form action={moveScore}>
              <input type="hidden" name="score_id" value={score.id} />
              <input type="hidden" name="dir" value="down" />
              <button className="text-accent-ink" aria-label="Move down">
                ↓ Down
              </button>
            </form>
          )}
          <form action={setScoreArchived}>
            <input type="hidden" name="score_id" value={score.id} />
            <input type="hidden" name="archived" value={score.archived ? "0" : "1"} />
            <button className="text-muted underline">{score.archived ? "Put back on the stand" : "Put away"}</button>
          </form>
          <form action={deleteScore} className="ml-auto">
            <input type="hidden" name="score_id" value={score.id} />
            <button className="text-danger underline">Delete</button>
          </form>
        </div>
      </div>
    </li>
  );
}
