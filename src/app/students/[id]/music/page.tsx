import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Shell } from "@/components/shell";
import { Button, Card, EmptyState, Pill, SectionTitle, cx } from "@/components/ui";
import { ReplaceScoreFile, ScoreUploader } from "@/components/score-uploader";
import { DeleteScoreButton, ReadMusicButton, RefreshWhileReading } from "@/components/score-actions";
import { requireTeacher } from "@/lib/auth";
import { getStudent } from "@/lib/data";
import { listScores } from "@/lib/scores";
import { SCORE_KINDS } from "@/lib/constants";
import { formatBytes } from "@/lib/format";
import { pageRange, sectionLabel, STATUS_LABELS, type SectionStatus } from "@/lib/score-analysis";
import { viewerHref } from "@/lib/music-links";
import Link from "next/link";
import type { StandScore } from "@/lib/stand-timeline";
import { moveScore, openMusicStand, renameScore, setScoreArchived } from "@/app/students/music-actions";

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
  const scores = await listScores(id, {
    includeArchived: true,
    withSourceLinks: true,
  });
  const active = scores.filter((s) => !s.archived);
  const archived = scores.filter((s) => s.archived);

  return (
    <Shell
      title="Music"
      eyebrow={`${student.name} · music stand`}
      back={{ href: `/students/${id}`, label: student.name }}
      tab="studio"
    >
      <div className="flex flex-col gap-6">
        <RefreshWhileReading active={scores.some((s) => s.analysisStatus === "running")} />
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
                <ScoreRow
                  key={s.id}
                  score={s}
                  studentName={student.name}
                  studentId={id}
                  first={i === 0}
                  last={i === active.length - 1}
                />
              ))}
            </ul>
          )}
        </section>

        <section>
          <SectionTitle>Add music</SectionTitle>
          <Card>
            <ScoreUploader studentId={id} />
          </Card>
        </section>

        {archived.length > 0 && (
          <section>
            <SectionTitle>Put away ({archived.length})</SectionTitle>
            <ul className="flex flex-col gap-2">
              {archived.map((s) => (
                <ScoreRow key={s.id} score={s} studentName={student.name} studentId={id} first last />
              ))}
            </ul>
          </section>
        )}
      </div>
    </Shell>
  );
}

function ScoreRow({
  score,
  studentName,
  studentId,
  first,
  last,
}: {
  score: StandScore;
  studentName: string;
  studentId: string;
  first: boolean;
  last: boolean;
}) {
  const cover = score.pages[0];
  const kind = SCORE_KINDS.find((k) => k.value === score.kind)?.label ?? score.kind;
  return (
    <li className="flex gap-3 rounded-2xl border border-rule bg-sheet p-3">
      <Link
        href={viewerHref(studentId, score.id)}
        className="h-24 w-[72px] shrink-0 overflow-hidden rounded-lg border border-rule bg-white"
        aria-label={`View ${score.title}`}
      >
        {cover?.url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover.url} alt="" className="h-full w-full object-cover object-top" loading="lazy" />
        )}
      </Link>
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
        {score.source && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <span className="min-w-0 truncate text-muted">
              Original: {score.source.name}
              {score.source.size ? ` · ${formatBytes(score.source.size)}` : ""}
            </span>
            {score.source.url && (
              <a href={score.source.url} className="text-accent-ink underline">
                Download
              </a>
            )}
          </div>
        )}
        {score.pages.length > 0 && (
          <Link href={viewerHref(studentId, score.id)} className="text-sm font-medium text-accent-ink underline">
            View the music (doesn&apos;t open the stand)
          </Link>
        )}
        <MusicReading score={score} studentName={studentName} studentId={studentId} />
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
          {score.pages.length > 0 && <ReplaceScoreFile scoreId={score.id} title={score.title} />}
          <span className="ml-auto">
            <DeleteScoreButton
              scoreId={score.id}
              title={score.title}
              pages={score.pages.length}
              pieces={score.sections.length}
              hasOriginal={!!score.source}
            />
          </span>
        </div>
      </div>
    </li>
  );
}

const STATUS_TONES: Record<SectionStatus, "accent" | "sage" | "plum" | "muted"> = {
  current: "accent",
  learned: "sage",
  upcoming: "plum",
  other: "muted",
};

// What Claude found in the music: the book, how it fits the student, and its pieces.
function MusicReading({
  score,
  studentName,
  studentId,
}: {
  score: StandScore;
  studentName: string;
  studentId: string;
}) {
  if (score.pages.length === 0) return null;
  if (score.analysisStatus === "running") {
    return <p className="text-sm text-muted">Claude is reading the music to find the pieces…</p>;
  }
  if (score.analysisStatus === "error") {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className="text-danger">{score.analysisError || "Reading the music didn't work."}</span>
        <ReadMusicButton scoreId={score.id} label="Read again" />
      </div>
    );
  }
  const a = score.analysis;
  if (!a) {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <ReadMusicButton scoreId={score.id} label="Find the pieces with AI" />
      </div>
    );
  }
  const current = a.sections.filter((s) => s.status === "current");
  return (
    <details className="group rounded-xl border border-rule bg-paper px-3 py-2 text-sm" open={a.sections.length <= 12}>
      <summary className="cursor-pointer list-none">
        <span className="font-semibold">
          {a.sections.length} piece{a.sections.length === 1 ? "" : "s"} found
        </span>
        {(a.book || a.edition) && (
          <span className="text-muted"> · {[a.book, a.edition].filter(Boolean).join(", ")}</span>
        )}
        <span className="text-accent-ink group-open:hidden"> · Show</span>
        {current.length > 0 && (
          <span className="mt-1 block">
            <Pill tone="accent">{studentName} is working on</Pill>{" "}
            {current.map((s) => `${sectionLabel(s, false)} (${pageRange(s)})`).join("; ")}
          </span>
        )}
      </summary>
      {a.fit && <p className="mt-2 text-muted">{a.fit}</p>}
      {a.pages_read < a.pages_total && (
        <p className="mt-1 text-xs text-muted">
          Only the first {a.pages_read} of {a.pages_total} pages were read.
        </p>
      )}
      <ol className="mt-2 divide-y divide-rule">
        {a.sections.map((s, i) => (
          <li
            key={`${s.start_page}-${i}`}
            className={cx("flex items-baseline gap-2 py-1.5", s.status === "current" && "font-semibold")}
          >
            <Link
              href={viewerHref(studentId, score.id, {
                from: s.start_page,
                to: s.end_page,
              })}
              className="min-w-0 flex-1 text-accent-ink hover:underline"
            >
              {sectionLabel(s)}
            </Link>
            {STATUS_LABELS[s.status] && <Pill tone={STATUS_TONES[s.status]}>{STATUS_LABELS[s.status]}</Pill>}
            <span className="shrink-0 tabular-nums text-muted">{pageRange(s)}</span>
          </li>
        ))}
      </ol>
      <div className="mt-2 flex flex-wrap gap-3">
        <ReadMusicButton scoreId={score.id} label="Read again" />
      </div>
    </details>
  );
}
