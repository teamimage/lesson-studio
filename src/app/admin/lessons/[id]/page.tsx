import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Shell } from "@/components/shell";
import { AdminDeleteButton, AdminEditForm, AdminNotices, Fold } from "@/components/admin-ui";
import { Card } from "@/components/ui";
import { requireAdmin } from "@/lib/admin";
import { formatDate } from "@/lib/format";

type Params = Promise<{ id: string }>;
type SP = Promise<{ saved?: string; deleted?: string; error?: string }>;

export default function AdminLessonPage({ params, searchParams }: { params: Params; searchParams: SP }) {
  return (
    <Suspense fallback={<Shell title="Lesson" back={{ href: "/admin", label: "All teachers" }} wide>{null}</Shell>}>
      <Body params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Body({ params, searchParams }: { params: Params; searchParams: SP }) {
  const { db } = await requireAdmin();
  const { id } = await params;
  const sp = await searchParams;
  const { data: lesson } = await db
    .from("lessons")
    .select("*, students(id, name), lesson_pieces(*), assignments(*)")
    .eq("id", id)
    .maybeSingle();
  if (!lesson) notFound();

  const back = `/admin/lessons/${id}`;
  const studentHref = `/admin/students/${lesson.student_id}`;
  const studentName = lesson.students?.name ?? "Student";
  const pieces = [...(lesson.lesson_pieces ?? [])].sort((a, b) => a.sort_order - b.sort_order);
  const tasks = [...(lesson.assignments ?? [])].sort((a, b) => a.sort_order - b.sort_order);

  return (
    <Shell
      title={formatDate(lesson.lesson_date, "long")}
      eyebrow={`Lesson · ${studentName}`}
      back={{ href: studentHref, label: studentName }}
      wide
    >
      <div className="flex flex-col gap-6">
        <AdminNotices sp={sp} />
        <p className="text-sm text-muted">
          <Link href={`/lessons/${id}`} className="text-accent-ink underline">
            Open this lesson in the app
          </Link>{" "}
          (works when it&apos;s in your own studio).
        </p>

        <Fold title="Lesson notes" open>
          <AdminEditForm table="lessons" row={lesson} back={back} />
        </Fold>

        <Fold title="Pieces played" count={pieces.length}>
          {pieces.map((p) => (
            <Card key={p.id} className="flex flex-col gap-2">
              <AdminEditForm table="lesson_pieces" row={p} back={back} compact />
              <div>
                <AdminDeleteButton table="lesson_pieces" id={p.id} back={back} confirm={`Remove ${p.title} from this lesson?`} />
              </div>
            </Card>
          ))}
          {pieces.length === 0 && <p className="text-sm text-muted">None.</p>}
        </Fold>

        <Fold title="Home practice assignments" count={tasks.length}>
          {tasks.map((a) => (
            <Card key={a.id} className="flex flex-col gap-2">
              <AdminEditForm table="assignments" row={a} back={back} compact />
              <div>
                <AdminDeleteButton table="assignments" id={a.id} back={back} confirm={`Delete the assignment ${a.title}?`} />
              </div>
            </Card>
          ))}
          {tasks.length === 0 && <p className="text-sm text-muted">None.</p>}
        </Fold>

        <Fold title="Delete this lesson">
          <p className="text-sm text-muted">
            Deletes the lesson with its pieces, assignments, music-stand log and videos. This can&apos;t be undone.
          </p>
          <div>
            <AdminDeleteButton
              table="lessons"
              id={id}
              back={studentHref}
              label="Delete lesson"
              confirm="Delete this lesson and its videos? This can't be undone."
            />
          </div>
        </Fold>
      </div>
    </Shell>
  );
}
