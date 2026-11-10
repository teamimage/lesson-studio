import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Shell } from "@/components/shell";
import { ScoreViewer } from "@/components/score-viewer";
import { requireTeacher } from "@/lib/auth";
import { getStudent } from "@/lib/data";
import { listScores } from "@/lib/scores";
import { sectionLabel } from "@/lib/score-analysis";

type Params = Promise<{ id: string; scoreId: string }>;
type SP = Promise<{ from?: string; to?: string; page?: string; originals?: string }>;

// Read-only music viewer: look at a book or one piece without opening the
// music stand (which starts today's lesson and logs page turns).
export default function MusicViewerPage({ params, searchParams }: { params: Params; searchParams: SP }) {
  return (
    <Suspense
      fallback={
        <Shell title="Music library" tab="studio">
          {null}
        </Shell>
      }
    >
      <Body params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Body({ params, searchParams }: { params: Params; searchParams: SP }) {
  await requireTeacher();
  const { id, scoreId } = await params;
  const sp = await searchParams;
  const student = await getStudent(id);
  if (!student) notFound();
  const score = (await listScores(id, { includeArchived: true, withOriginals: true, includePending: true })).find((s) => s.id === scoreId);
  if (!score) notFound();
  const n = (v?: string) => (v && Number.isFinite(Number(v)) ? Math.round(Number(v)) : undefined);
  const from = n(sp.from);
  const to = n(sp.to);
  const piece = from ? score.sections.find((s) => s.start_page === from && s.end_page === (to ?? from)) : null;

  return (
    <Shell
      title={piece ? sectionLabel(piece, false) : score.title}
      eyebrow={`${student.name} · ${piece ? score.title : "music preview"}`}
      back={{ href: `/students/${id}/music`, label: "Music library" }}
      tab="studio"
      actions={
        <Link href={`/students/${id}`} className="text-sm font-medium text-accent-ink">
          {student.name}
        </Link>
      }
    >
      {score.pages.length === 0 ? (
        <p className="text-sm text-muted">The pages of this music haven&apos;t finished uploading.</p>
      ) : (
        <ScoreViewer
          score={{
            id: score.id,
            title: score.title,
            pages: score.pages.map((p, i) => ({
              url: p.url,
              w: p.w,
              h: p.h,
              original: p.original
                ? { url: p.originalUrl ?? null, w: p.original.w, h: p.original.h, whole: !!p.whole }
                : null,
              scan: { n: i + 1, url: p.originalUrl ?? null, path: p.original?.path ?? p.path },
            })),
            sections: score.sections,
          }}
          from={from}
          to={to}
          page={n(sp.page)}
          originals={sp.originals === "1"}
        />
      )}
    </Shell>
  );
}
