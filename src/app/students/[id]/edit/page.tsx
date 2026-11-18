import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Shell } from "@/components/shell";
import { StudentForm } from "@/components/student-form";
import { Button, Card, Field, Input, Notice, SectionTitle } from "@/components/ui";
import { requireTeacher } from "@/lib/auth";
import { getStudent, listParentsForStudent } from "@/lib/data";
import { addParent, removeParent, updateStudent } from "../../actions";
import { getStudentOverview } from "@/lib/overview/data";
import { ContactDetailsForm } from "@/components/student-overview-parts";
import { createClient } from "@/lib/supabase/server";

/** The length of the student's current regular lesson, else 30. */
async function usualMinutes(studentId: string): Promise<number> {
  const { data } = await (await createClient())
    .from("lesson_slots")
    .select("minutes, ends_on")
    .eq("student_id", studentId)
    .order("created_at", { ascending: false });
  return (data ?? []).find((s) => !s.ends_on || s.ends_on >= new Date().toISOString().slice(0, 10))?.minutes ?? 30;
}

type Params = Promise<{ id: string }>;
type SP = Promise<{ error?: string }>;

export default function EditStudentPage({ params, searchParams }: { params: Params; searchParams: SP }) {
  return (
    <Suspense fallback={<Shell title="Edit student" tab="studio">{null}</Shell>}>
      <Body params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Body({ params, searchParams }: { params: Params; searchParams: SP }) {
  await requireTeacher();
  const { id } = await params;
  const { error } = await searchParams;
  const [student, parents] = await Promise.all([getStudent(id), listParentsForStudent(id)]);
  if (!student) notFound();
  const overview = await getStudentOverview(student, []);

  return (
    <Shell title={student.name} eyebrow="Edit student" back={{ href: `/students/${id}`, label: student.name }} tab="studio">
      <div className="flex flex-col gap-8">
        {error === "save" && <Notice tone="danger">Something went wrong saving. Try again.</Notice>}
        {error === "photo" && <Notice tone="danger">The details were saved, but the photo didn&apos;t upload. Try it again.</Notice>}
        {error === "parent" && <Notice tone="danger">A parent needs an email address.</Notice>}
        <StudentForm
          student={student}
          action={updateStudent}
          submitLabel="Save changes"
          lengthReady={"lesson_minutes" in student}
          defaultMinutes={await usualMinutes(student.id)}
        />

        <section>
          <SectionTitle>Parents</SectionTitle>
          <p className="mb-3 text-sm text-muted">
            A parent who signs in with one of these emails sees this student&apos;s home practice plan and can log practice.
          </p>
          <div className="flex flex-col gap-2">
            {parents.map((p) => (
              <Card key={p.id} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{p.name}</div>
                  <div className="truncate text-sm text-muted">{p.email}</div>
                </div>
                <form action={removeParent}>
                  <input type="hidden" name="student_id" value={id} />
                  <input type="hidden" name="parent_id" value={p.id} />
                  <Button variant="ghost" className="min-h-9 px-2 text-sm">
                    Remove
                  </Button>
                </form>
              </Card>
            ))}
            <form action={addParent} className="flex flex-col gap-3 rounded-2xl border border-dashed border-rule p-4">
              <input type="hidden" name="student_id" value={id} />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Parent name">
                  <Input name="name" />
                </Field>
                <Field label="Parent email">
                  <Input name="email" type="email" required />
                </Field>
              </div>
              <Button variant="secondary">Add parent</Button>
            </form>
          </div>
        </section>

        <section>
          <SectionTitle>Contact details</SectionTitle>
          <p className="mb-3 text-sm text-muted">
            Used by the Contact buttons on the student page. Messages are sent from the app and kept in the communication history.
          </p>
          {overview.ready ? (
            <div className="flex flex-col divide-y divide-rule">
              {overview.contacts.map((c) => (
                <div key={c.key} className="flex flex-col gap-2 py-3">
                  <p className="font-semibold">
                    {c.name} <span className="text-sm font-normal text-muted">{c.role === "student" ? "student" : "parent"}</span>
                  </p>
                  <ContactDetailsForm studentId={id} contact={c} />
                </div>
              ))}
            </div>
          ) : (
            <Notice tone="amber">Run student-overview.sql in Supabase to add emails and mobile numbers here.</Notice>
          )}
        </section>
      </div>
    </Shell>
  );
}
