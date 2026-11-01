import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Shell } from "@/components/shell";
import { AdminDeleteButton, AdminEditForm, AdminNotices, Fold } from "@/components/admin-ui";
import { Button, Card, Field, Input, Pill, SectionTitle } from "@/components/ui";
import { requireAdmin } from "@/lib/admin";
import { formatBytes, formatDate } from "@/lib/format";
import { adminLinkParent, adminUnlinkParent } from "../../actions";

type Params = Promise<{ id: string }>;
type SP = Promise<{ saved?: string; deleted?: string; error?: string }>;

export default function AdminStudentPage({ params, searchParams }: { params: Params; searchParams: SP }) {
  return (
    <Suspense fallback={<Shell title="Student" back={{ href: "/admin", label: "All teachers" }} wide>{null}</Shell>}>
      <Body params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Body({ params, searchParams }: { params: Params; searchParams: SP }) {
  const { db } = await requireAdmin();
  const { id } = await params;
  const sp = await searchParams;
  const { data: student } = await db.from("students").select("*").eq("id", id).maybeSingle();
  if (!student) notFound();

  const [teacherRes, linksRes, lessonsRes, repRes, logsRes, recRes, scoreRes] = await Promise.all([
    db.from("teachers").select("id, name, studio_name").eq("id", student.teacher_id).maybeSingle(),
    db.from("student_parents").select("parent_id, parents(*)").eq("student_id", id),
    db.from("lessons").select("id, lesson_date, status, summary").eq("student_id", id).order("lesson_date", { ascending: false }),
    db.from("repertoire").select("*").eq("student_id", id).order("started_on", { ascending: false }),
    db.from("practice_logs").select("*").eq("student_id", id).order("practice_date", { ascending: false }).limit(60),
    db.from("recordings").select("*, lessons(lesson_date)").eq("student_id", id).order("created_at", { ascending: false }),
    db.from("scores").select("id, title, kind, archived, pages").eq("student_id", id).order("sort_order"),
  ]);
  const teacher = teacherRes.data;
  const teacherLabel = teacher?.name || teacher?.studio_name || "Teacher";
  const back = `/admin/students/${id}`;
  const parents = (linksRes.data ?? []).map((l) => l.parents).filter((p): p is NonNullable<typeof p> => !!p);
  const lessons = lessonsRes.data ?? [];
  const rep = repRes.data ?? [];
  const logs = logsRes.data ?? [];
  const recs = recRes.data ?? [];
  const scores = scoreRes.data ?? [];

  return (
    <Shell
      title={student.name}
      eyebrow={`Student of ${teacherLabel}`}
      back={{ href: `/admin/teachers/${student.teacher_id}`, label: teacherLabel }}
      wide
    >
      <div className="flex flex-col gap-6">
        <AdminNotices sp={sp} />

        <Fold title="Student details" open>
          <AdminEditForm table="students" row={student} back={back} />
        </Fold>

        <Fold title="Parents" count={parents.length} open={parents.length === 0}>
          {parents.map((p) => (
            <Card key={p.id} className="flex items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <div className="font-medium">{p.name}</div>
                <div className="truncate text-sm text-muted">
                  {p.email} · {p.user_id ? "has signed in" : "hasn't signed in yet"}
                </div>
              </div>
              <form action={adminUnlinkParent}>
                <input type="hidden" name="student_id" value={id} />
                <input type="hidden" name="parent_id" value={p.id} />
                <Button variant="ghost" className="min-h-9 px-2 text-sm">
                  Remove
                </Button>
              </form>
            </Card>
          ))}
          <form action={adminLinkParent} className="flex flex-col gap-3 rounded-2xl border border-dashed border-rule p-4">
            <input type="hidden" name="teacher_id" value={student.teacher_id} />
            <input type="hidden" name="student_id" value={id} />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Parent name">
                <Input name="name" />
              </Field>
              <Field label="Parent email">
                <Input name="email" type="email" required />
              </Field>
            </div>
            <div>
              <Button variant="secondary">Add parent</Button>
            </div>
          </form>
          <p className="text-xs text-muted">
            To edit a parent&apos;s name or email, go back to {teacherLabel}&apos;s page and open Parents.
          </p>
        </Fold>

        <section>
          <SectionTitle>Lessons</SectionTitle>
          <div className="flex flex-col gap-2">
            {lessons.map((l) => (
              <Link key={l.id} href={`/admin/lessons/${l.id}`} className="block">
                <Card className="flex items-center gap-3 py-3 transition hover:border-accent/50">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold">{formatDate(l.lesson_date, "long")}</div>
                    <div className="truncate text-sm text-muted">{l.summary || "No summary yet"}</div>
                  </div>
                  <Pill tone={l.status === "approved" ? "sage" : "amber"}>
                    {l.status === "approved" ? "Approved" : "Draft"}
                  </Pill>
                  <span className="text-accent-ink" aria-hidden>
                    ›
                  </span>
                </Card>
              </Link>
            ))}
            {lessons.length === 0 && <p className="text-sm text-muted">No lessons yet.</p>}
          </div>
        </section>

        <Fold title="Lesson videos" count={recs.length}>
          {recs.map((r) => (
            <Card key={r.id} className="flex flex-col gap-2">
              <div className="text-sm">
                <span className="font-medium">{r.file_name}</span>
                <span className="text-muted">
                  {" · "}
                  {formatBytes(r.size_bytes)} · lesson {formatDate(r.lessons?.lesson_date, "short")}
                  {r.status !== "ready" ? " · upload not finished" : ""}
                </span>
              </div>
              <AdminEditForm table="recordings" row={r} back={back} compact />
              <div>
                <AdminDeleteButton
                  table="recordings"
                  id={r.id}
                  back={back}
                  label="Delete video"
                  confirm={`Delete the video ${r.file_name}? The file is removed for good.`}
                />
              </div>
            </Card>
          ))}
          {recs.length === 0 && <p className="text-sm text-muted">No videos.</p>}
        </Fold>

        <Fold title="Repertoire" count={rep.length}>
          {rep.map((r) => (
            <Card key={r.id} className="flex flex-col gap-2">
              <AdminEditForm table="repertoire" row={r} back={back} compact />
              <div>
                <AdminDeleteButton table="repertoire" id={r.id} back={back} confirm={`Delete ${r.title} from the repertoire?`} />
              </div>
            </Card>
          ))}
          {rep.length === 0 && <p className="text-sm text-muted">No pieces yet.</p>}
        </Fold>

        <Fold title="Home practice log" count={logs.length}>
          {logs.map((l) => (
            <Card key={l.id} className="flex flex-col gap-2">
              <AdminEditForm table="practice_logs" row={l} back={back} compact />
              <div>
                <AdminDeleteButton
                  table="practice_logs"
                  id={l.id}
                  back={back}
                  confirm={`Delete the practice log for ${formatDate(l.practice_date)}?`}
                />
              </div>
            </Card>
          ))}
          {logs.length === 0 && <p className="text-sm text-muted">No practice logged.</p>}
        </Fold>

        <Fold title="Sheet music" count={scores.length}>
          {scores.map((s) => (
            <Card key={s.id} className="flex flex-col gap-2">
              <div className="text-sm text-muted">{Array.isArray(s.pages) ? s.pages.length : 0} pages</div>
              <AdminEditForm table="scores" row={s} back={back} compact />
              <div>
                <AdminDeleteButton table="scores" id={s.id} back={back} confirm={`Delete the music ${s.title}?`} />
              </div>
            </Card>
          ))}
          {scores.length === 0 && <p className="text-sm text-muted">No music uploaded.</p>}
        </Fold>

        <Fold title="Delete this student">
          <p className="text-sm text-muted">
            Deletes {student.name} with all lessons, practice logs, repertoire, music and videos. This can&apos;t be
            undone.
          </p>
          <div>
            <AdminDeleteButton
              table="students"
              id={id}
              back={`/admin/teachers/${student.teacher_id}`}
              label="Delete student"
              confirm={`Delete ${student.name} and everything about them? This can't be undone.`}
            />
          </div>
        </Fold>
      </div>
    </Shell>
  );
}
