import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Shell } from "@/components/shell";
import { BarMapEditor } from "@/components/bar-map-editor";
import { requireTeacher } from "@/lib/auth";
import { getStudent } from "@/lib/data";
import { listScores } from "@/lib/scores";
import { viewerHref } from "@/lib/music-links";

type Params = Promise<{ id: string; scoreId: string }>;

// The bar map of one upload: made once, checked and corrected by the teacher.
export default function BarMapPage({ params }: { params: Params }) {
  return (
    <Suspense
      fallback={
        <Shell title="Bar map" tab="studio">
          {null}
        </Shell>
      }
    >
      <Body params={params} />
    </Suspense>
  );
}

async function Body({ params }: { params: Params }) {
  await requireTeacher();
  const { id, scoreId } = await params;
  const student = await getStudent(id);
  if (!student) notFound();
  const score = (await listScores(id, { includeArchived: true })).find((s) => s.id === scoreId);
  if (!score) notFound();

  return (
    <Shell
      title="Bar map"
      eyebrow={`${student.name} · ${score.title}`}
      back={{ href: `/students/${id}/music`, label: "Music library" }}
      tab="studio"
      actions={
        <Link href={viewerHref(id, score.id)} className="text-sm font-medium text-accent-ink">
          View music
        </Link>
      }
    >
      {score.pages.length === 0 ? (
        <p className="text-sm text-muted">The pages of this music haven&apos;t finished uploading.</p>
      ) : score.sections.length === 0 ? (
        <p className="text-sm text-muted">
          Let Claude find the pieces in this music first (in the music library), then come back to make the bar map.
        </p>
      ) : (
        <BarMapEditor
          scoreId={score.id}
          pages={score.pages.map((p) => ({ url: p.url, w: p.w, h: p.h, bars: p.bars ?? null }))}
          sections={score.sections}
        />
      )}
    </Shell>
  );
}
