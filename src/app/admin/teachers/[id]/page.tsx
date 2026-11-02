import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Shell } from "@/components/shell";
import { AvatarFace } from "@/components/avatar";
import { InstrumentTag } from "@/components/instrument-tag";
import { AdminDeleteButton, AdminEditForm, AdminNotices, Fold } from "@/components/admin-ui";
import { ConfirmButton } from "@/components/confirm-button";
import { Button, Card, Field, Input, Pill, Select, SectionTitle } from "@/components/ui";
import { requireAdmin } from "@/lib/admin";
import { INSTRUMENTS, instrumentLabel, studentPhotoSrc } from "@/lib/constants";
import { adminCreateStudent, adminDeleteAccount } from "../../actions";

type Params = Promise<{ id: string }>;
type SP = Promise<{ saved?: string; deleted?: string; error?: string }>;

export default function AdminTeacherPage({ params, searchParams }: { params: Params; searchParams: SP }) {
  return (
    <Suspense fallback={<Shell title="Teacher" back={{ href: "/admin", label: "All teachers" }} wide>{null}</Shell>}>
      <Body params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Body({ params, searchParams }: { params: Params; searchParams: SP }) {
  const { db, viewer } = await requireAdmin();
  const { id } = await params;
  const sp = await searchParams;
  const { data: teacher } = await db.from("teachers").select("*").eq("id", id).maybeSingle();
  if (!teacher) notFound();

  const [{ data: users }, { data: students }, { data: parents }, { data: links }] = await Promise.all([
    db.rpc("admin_list_users"),
    db.from("students").select("*").eq("teacher_id", id).order("active", { ascending: false }).order("name"),
    db.from("parents").select("*").eq("teacher_id", id).order("name"),
    db.from("student_parents").select("student_id, parent_id"),
  ]);
  const email = (users ?? []).find((u) => u.id === teacher.user_id)?.email ?? "(account missing)";
  const back = `/admin/teachers/${id}`;
  const studentName = new Map((students ?? []).map((s) => [s.id, s.name]));

  return (
    <Shell
      title={teacher.name || "No name yet"}
      eyebrow={`Teacher · ${email}`}
      back={{ href: "/admin", label: "All teachers" }}
      wide
    >
      <div className="flex flex-col gap-8">
        <AdminNotices sp={sp} />

        <section>
          <SectionTitle>Students</SectionTitle>
          <div className="flex flex-col gap-2">
            {(students ?? []).map((s) => (
              <Link key={s.id} href={`/admin/students/${s.id}`} className="block">
                <Card className="flex items-center gap-3 py-3 transition hover:border-accent/50">
                  <AvatarFace name={s.name} instrument={s.instrument} photoSrc={studentPhotoSrc(s)} className="h-10 w-10 text-xl" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="font-semibold">{s.name}</span>
                      <InstrumentTag instrument={s.instrument} />
                    </div>
                    {s.current_book && <div className="text-sm text-muted">{s.current_book}</div>}
                  </div>
                  {!s.active && <Pill>Inactive</Pill>}
                  <span className="text-accent-ink" aria-hidden>
                    ›
                  </span>
                </Card>
              </Link>
            ))}
            {(students ?? []).length === 0 && <p className="text-sm text-muted">No students yet.</p>}
            <form
              action={adminCreateStudent}
              className="mt-1 flex flex-col gap-3 rounded-2xl border border-dashed border-rule p-4"
            >
              <input type="hidden" name="teacher_id" value={id} />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="New student name">
                  <Input name="name" required />
                </Field>
                <Field label="Instrument">
                  <Select name="instrument" defaultValue="piano">
                    {INSTRUMENTS.map((i) => (
                      <option key={i} value={i}>
                        {instrumentLabel(i)}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <div>
                <Button variant="secondary">Add student</Button>
              </div>
            </form>
          </div>
        </section>

        <Fold title="Teacher details">
          <AdminEditForm table="teachers" row={teacher} back={back} />
        </Fold>

        <Fold title="Parents" count={(parents ?? []).length}>
          <p className="text-sm text-muted">
            To connect a parent to a child, open the student. Editing a parent&apos;s email changes which sign-in
            sees that family&apos;s practice plan.
          </p>
          {(parents ?? []).map((p) => {
            const kids = (links ?? [])
              .filter((l) => l.parent_id === p.id)
              .map((l) => studentName.get(l.student_id))
              .filter(Boolean);
            return (
              <Card key={p.id} className="flex flex-col gap-2">
                <div className="text-sm text-muted">
                  {kids.length ? `Parent of ${kids.join(", ")}` : "Not linked to a student"}
                  {p.user_id ? " · has signed in" : " · hasn't signed in yet"}
                </div>
                <AdminEditForm table="parents" row={p} back={back} compact />
                <div>
                  <AdminDeleteButton
                    table="parents"
                    id={p.id}
                    back={back}
                    label="Delete parent"
                    confirm={`Delete ${p.name}? They lose access to their children's practice plans.`}
                  />
                </div>
              </Card>
            );
          })}
        </Fold>

        {teacher.user_id !== viewer.userId && (
          <Fold title="Delete this teacher">
            <p className="text-sm text-muted">
              Deletes the sign-in for {email} and everything in this studio: students, parents, lessons, practice
              logs, music and videos. This can&apos;t be undone.
            </p>
            <form action={adminDeleteAccount}>
              <input type="hidden" name="user_id" value={teacher.user_id} />
              <ConfirmButton
                message={`Delete ${email} and their whole studio? This can't be undone.`}
                variant="danger"
              >
                Delete teacher and studio
              </ConfirmButton>
            </form>
          </Fold>
        )}
      </div>
    </Shell>
  );
}
