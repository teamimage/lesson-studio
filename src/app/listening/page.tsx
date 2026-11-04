import Link from "next/link";
import { Suspense } from "react";
import { Shell } from "@/components/shell";
import { Card, EmptyState, SectionTitle, cx } from "@/components/ui";
import { ReferenceLinkForm, ReferenceUploader } from "@/components/reference-uploader";
import { ReferenceLibrary } from "@/components/reference-library";
import { requireTeacher } from "@/lib/auth";
import { listStudents } from "@/lib/data";
import { listReferenceRecordings } from "@/lib/reference-data";
import { bookChoices } from "@/lib/reference-recordings";
import { instrumentLabel, suzukiBookTitles } from "@/lib/constants";
import { booksFor } from "@/lib/suzuki";

type SP = Promise<{ instrument?: string }>;

// The studio's reference recordings for every instrument: upload, file by
// book and track, rename and delete. Each student's Music page shows the
// same library for their instrument.
export default function ListeningPage({ searchParams }: { searchParams: SP }) {
  return (
    <Shell title="Reference recordings" eyebrow="Studio · listening" back={{ href: "/", label: "Studio" }} tab="studio">
      <Suspense fallback={null}>
        <Body searchParams={searchParams} />
      </Suspense>
    </Shell>
  );
}

async function Body({ searchParams }: { searchParams: SP }) {
  await requireTeacher();
  const [{ instrument: wanted }, students, library] = await Promise.all([
    searchParams,
    listStudents(),
    listReferenceRecordings({ withUrls: true }),
  ]);
  const instruments = [
    ...new Set([
      ...students.filter((s) => s.active).map((s) => s.instrument),
      ...library.recordings.map((r) => r.instrument).filter((x): x is string => !!x),
    ]),
  ];
  if (!instruments.length) instruments.push("cello");
  const instrument = wanted && instruments.includes(wanted) ? wanted : instruments[0];
  const books = bookChoices(suzukiBookTitles(instrument), booksFor(instrument), []);
  const recordings = library.recordings.filter((r) => !r.instrument || r.instrument === instrument);
  const firstStudent = students.find((s) => s.active && s.instrument === instrument);

  return (
    <div className="flex flex-col gap-6">
      <Card tone="plum" className="text-[15px]">
        Recordings for students to listen to, filed by book and track. Assign one as a Listening item in a lesson&apos;s
        practice list; the family gets a player on Home practice. Nothing comes pre-loaded: add recordings you own, like
        the ones that come with each Suzuki book. They are never used to grade practice.
      </Card>

      {instruments.length > 1 && (
        <nav className="flex flex-wrap gap-2 text-sm">
          {instruments.map((i) => (
            <Link
              key={i}
              href={`/listening?instrument=${i}`}
              className={cx(
                "rounded-full border px-3 py-1.5 font-medium",
                i === instrument ? "border-plum bg-plum text-white" : "border-rule bg-sheet text-ink",
              )}
            >
              {instrumentLabel(i)}
            </Link>
          ))}
        </nav>
      )}

      {!library.ready ? (
        <Card className="text-sm text-muted">
          Reference recordings aren&apos;t set up yet. Run reference-recordings.sql in the Supabase SQL Editor, then
          reload this page.
        </Card>
      ) : (
        <>
          <section>
            <SectionTitle>
              {instrumentLabel(instrument)} recordings ({recordings.length})
            </SectionTitle>
            {recordings.length === 0 ? (
              <EmptyState title="No recordings yet">Add a book&apos;s recording below, a whole album at once.</EmptyState>
            ) : (
              <ReferenceLibrary recordings={recordings} urls={library.urls} books={books} />
            )}
            {firstStudent && (
              <p className="mt-2 text-sm text-muted">
                Tip: on a student&apos;s{" "}
                <Link href={`/students/${firstStudent.id}/music#recordings`} className="text-accent-ink underline">
                  Music page
                </Link>{" "}
                the book list also offers the pieces Claude found in their uploaded music.
              </p>
            )}
          </section>
          <section>
            <SectionTitle>Add {instrumentLabel(instrument).toLowerCase()} recordings</SectionTitle>
            <Card className="flex flex-col gap-4">
              <ReferenceUploader instrument={instrument} books={books} />
              <details className="border-t border-rule pt-3">
                <summary className="cursor-pointer text-sm font-medium text-accent-ink">
                  Or add a link to a recording somewhere else
                </summary>
                <div className="mt-3">
                  <ReferenceLinkForm instrument={instrument} books={books} />
                </div>
              </details>
            </Card>
          </section>
        </>
      )}
    </div>
  );
}
