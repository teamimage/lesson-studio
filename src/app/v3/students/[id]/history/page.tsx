import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Shell } from "@/components/shell";
import { Me } from "@/components/v3/me";
import { Timeline } from "@/components/v3/timeline";
import { InstrumentTag } from "@/components/instrument-tag";
import { requireTeacher } from "@/lib/auth";
import { getStudent } from "@/lib/data";
import { loadHistory } from "../history-data";

type Params = Promise<{ id: string }>;
type SP = Promise<{ show?: string }>;

// Version 3: "See all history" from the student page. The same sections and
// cards as the student page's last 10 days, going back as far as there is.
export default function V3StudentHistoryPage({ params, searchParams }: { params: Params; searchParams: SP }) {
  return (
    <Suspense fallback={<Shell title=" " v3Tab="students" me={<Me />} wide>{null}</Shell>}>
      <Body params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Body({ params, searchParams }: { params: Params; searchParams: SP }) {
  await requireTeacher();
  const { id } = await params;
  const sp = await searchParams;
  const student = await getStudent(id);
  if (!student) notFound();
  const { entries } = await loadHistory(id, true);
  const first = student.name.split(" ")[0];

  return (
    <Shell
      title={
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          {first}&apos;s history
          <InstrumentTag instrument={student.instrument} />
        </span>
      }
      eyebrow={student.current_book ?? undefined}
      back={{ href: `/v3/students/${id}`, label: first }}
      v3Tab="students"
      me={<Me />}
      wide
    >
      <Timeline
        entries={entries}
        initial={sp.show}
        headingNote="all history"
      />
    </Shell>
  );
}
