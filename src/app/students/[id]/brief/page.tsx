import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { AssignmentList } from "@/components/assignment-list";
import { Shell } from "@/components/shell";
import { WeekStrip } from "@/components/week-strip";
import { Card, LinkButton, Pill, Row, SectionTitle } from "@/components/ui";
import { requireTeacher } from "@/lib/auth";
import { getPracticeWeek, getStudent, listLessons, listRepertoire, staleReview } from "@/lib/data";
import { capitalize, formatDate, relativeDay } from "@/lib/format";

type Params = Promise<{ id: string }>;

// Two-minute read before the lesson: last time, what was assigned, how
// the week at home went, and what to consider today.
export default function BriefPage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<Shell title="Pre-lesson brief" tab="studio">{null}</Shell>}>
      <Body params={params} />
    </Suspense>
  );
}

async function Body({ params }: { params: Params }) {
  await requireTeacher();
  const { id } = await params;
  const student = await getStudent(id);
  if (!student) notFound();
  const [lessons, week, repertoire] = await Promise.all([listLessons(id, 6), getPracticeWeek(id), listRepertoire(id)]);
  const last = lessons.find((l) => l.status === "approved") ?? lessons[0];
  const drafts = lessons.filter((l) => l.status === "draft");
  const stale = staleReview(repertoire);
  const learning = repertoire.filter((r) => r.status === "learning" || r.status === "preview");
  const polishing = repertoire.filter((r) => r.status === "polishing");
  const practiceTone = week.daysPracticed >= 5 ? "sage" : week.daysPracticed >= 3 ? "amber" : "danger";

  return (
    <Shell
      title={student.name}
      eyebrow="Pre-lesson brief"
      back={{ href: `/students/${id}`, label: student.name }}
      tab="studio"
      actions={
        <LinkButton href={`/students/${id}/lessons/new`} className="min-h-9 px-3 text-sm">
          Record lesson
        </LinkButton>
      }
    >
      <div className="flex flex-col gap-5">
        <Card tone="accent" className="text-[15px] leading-relaxed">
          <div className="font-semibold">
            {capitalize(student.instrument)}
            {student.current_book ? ` · ${student.current_book}` : ""}
            {student.age ? ` · age ${student.age}` : ""}
          </div>
          <div className="mt-1 text-sm">
            {learning.length > 0 && (
              <>
                <span className="text-muted">Working on </span>
                {learning.map((r) => r.title).join(", ")}
                {". "}
              </>
            )}
            {polishing.length > 0 && (
              <>
                <span className="text-muted">Polishing </span>
                {polishing.map((r) => r.title).join(", ")}.
              </>
            )}
            {learning.length === 0 && polishing.length === 0 && (
              <span className="text-muted">No repertoire yet. It fills in as lessons are approved.</span>
            )}
          </div>
        </Card>

        {drafts.length > 0 && (
          <Card tone="amber" className="text-sm">
            {drafts.length === 1 ? "A lesson record is" : `${drafts.length} lesson records are`} still in draft, so the
            family hasn&apos;t seen {drafts.length === 1 ? "it" : "them"}.{" "}
            <Link href={`/lessons/${drafts[0].id}`} className="font-semibold underline">
              Review and approve
            </Link>
          </Card>
        )}

        {last ? (
          <Card className="divide-y divide-rule">
            <div className="flex items-center justify-between pb-2">
              <div className="font-semibold">Last lesson</div>
              <Link href={`/lessons/${last.id}`} className="text-sm text-accent-ink underline">
                {formatDate(last.lesson_date, "weekday")} · {relativeDay(last.lesson_date)}
              </Link>
            </div>
            {last.summary && <Row label="We did">{last.summary}</Row>}
            {last.focus_points && <Row label="Focus">{last.focus_points}</Row>}
            {last.teacher_notes && <Row label="Notes">{last.teacher_notes}</Row>}
          </Card>
        ) : (
          <Card className="text-sm text-muted">No lessons recorded yet. After the first one, the brief fills in.</Card>
        )}

        {last && last.assignments.length > 0 && (
          <section>
            <SectionTitle>Assigned</SectionTitle>
            <AssignmentList assignments={last.assignments} />
          </section>
        )}

        <section>
          <SectionTitle
            action={
              <Link href={`/family/${id}`} className="text-sm text-accent-ink underline">
                Full log
              </Link>
            }
          >
            At home this week
          </SectionTitle>
          <Card className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-1.5">
              <Pill tone={practiceTone}>practiced {week.daysPracticed} of 7 days</Pill>
              <Pill tone="plum">listened {week.daysListened} of 7</Pill>
              {week.totalMinutes > 0 && <Pill>{week.totalMinutes} min total</Pill>}
            </div>
            <WeekStrip week={week} />
            {week.notes.length > 0 ? (
              <ul className="flex flex-col gap-1.5 text-sm">
                {week.notes.map((n) => (
                  <li key={n.id} className="rounded-xl bg-plum-soft px-3 py-2">
                    <span className="font-medium text-plum">Parent, {formatDate(n.practice_date)}:</span> “{n.parent_note}”
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">No parent notes this week.</p>
            )}
          </Card>
        </section>

        <section>
          <SectionTitle>Consider today</SectionTitle>
          <Card tone="sage" className="flex flex-col gap-2 text-[15px] leading-relaxed">
            {last?.suggestions && <p className="whitespace-pre-line">{last.suggestions}</p>}
            {stale.length > 0 && (
              <p>
                <span className="font-medium">Review rotation: </span>
                {stale
                  .slice(0, 3)
                  .map((r) => `${r.title} (${r.daysSince === null ? "not yet played" : `${r.daysSince} days`})`)
                  .join(", ")}{" "}
                {stale.length === 1 ? "hasn't" : "haven't"} come up lately.
              </p>
            )}
            {week.daysPracticed <= 2 && last && (
              <p>
                <span className="font-medium">Light practice week. </span>
                Ask the parent what got in the way before adding anything new.
              </p>
            )}
            {!last?.suggestions && stale.length === 0 && week.daysPracticed > 2 && (
              <p className="text-muted">Nothing flagged. Add suggestions in the lesson record to see them here.</p>
            )}
          </Card>
        </section>

        <LinkButton href={`/students/${id}/lessons/new`} className="mt-2">
          Record today&apos;s lesson
        </LinkButton>
      </div>
    </Shell>
  );
}
