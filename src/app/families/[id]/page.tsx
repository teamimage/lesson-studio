import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Shell } from "@/components/shell";
import { Me } from "@/components/v3/me";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { GuardianStatus } from "@/components/guardian-status";
import { Button, Input, Notice, Select } from "@/components/ui";
import { requireTeacher } from "@/lib/auth";
import { accessLabel, firstName, loadFamily } from "@/lib/families";
import { addStudentToFamily, deleteFamily, removeStudentFromFamily, renameFamily } from "../actions";

type Params = Promise<{ id: string }>;
type SP = Promise<{ saved?: string }>;

const SAVED: Record<string, string> = {
  name: "Name saved.",
  student: "Added to the family. Guardians who see the whole family can see them now.",
  removed: "Taken out of the family.",
  "guardian-removed": "Guardian removed. They can't sign in to this family any more.",
};

// One family: its children (each opens the student's page) and its parents
// and guardians (each opens their own page, where the invite lives).
export default function FamilyPage({ params, searchParams }: { params: Params; searchParams: SP }) {
  return (
    <Suspense fallback={<Shell title=" " tab="settings" v3Tab="setup" me={<Me />}>{null}</Shell>}>
      <Body params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Body({ params, searchParams }: { params: Params; searchParams: SP }) {
  await requireTeacher();
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const { data, family: f } = await loadFamily(id);
  if (!f) notFound();
  const others = [...data.loose, ...data.families.filter((x) => x.id !== f.id).flatMap((x) => x.students)].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  const familyOf = new Map(data.families.flatMap((x) => x.students.map((s) => [s.id, x.name] as const)));

  return (
    <Shell
      title={f.name || "Family"}
      tab="settings"
      v3Tab="setup"
      me={<Me />}
      back={{ href: "/families", label: "Families" }}
    >
      <div className="flex flex-col gap-7">
        {sp.saved && SAVED[sp.saved] && <Notice tone="sage">{SAVED[sp.saved]}</Notice>}

        <section>
          <h2 className="mb-1 text-lg font-semibold">Children</h2>
          {f.students.length === 0 && <p className="text-[16px] text-muted">No children in this family yet.</p>}
          <ul className="divide-y divide-rule">
            {f.students.map((s) => (
              <li key={s.id} className="flex min-h-12 items-center gap-2">
                <Link href={`/students/${s.id}`} className="flex min-w-0 flex-1 items-center gap-2 py-2 text-[17px]">
                  <span className="font-medium text-accent-ink">{s.name}</span>
                  <span className="text-sm text-muted">{s.instrument}</span>
                  {!s.active && <span className="text-sm text-muted">· not active</span>}
                </Link>
                <form action={removeStudentFromFamily}>
                  <input type="hidden" name="family_id" value={f.id} />
                  <input type="hidden" name="student_id" value={s.id} />
                  <ConfirmSubmit
                    message={`Take ${firstName(s.name)} out of ${f.name}? Guardians who see the whole family lose access to ${firstName(s.name)}.`}
                    className="text-sm text-muted underline"
                  >
                    Take out
                  </ConfirmSubmit>
                </form>
              </li>
            ))}
          </ul>
          {others.length > 0 && (
            <form action={addStudentToFamily} className="mt-2 flex flex-wrap items-center gap-2">
              <input type="hidden" name="family_id" value={f.id} />
              <Select name="student_id" required defaultValue="" className="min-w-0 flex-1">
                <option value="" disabled>
                  Add a child…
                </option>
                {others.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {familyOf.get(s.id) ? ` (now in ${familyOf.get(s.id)})` : ""}
                  </option>
                ))}
              </Select>
              <Button variant="secondary" className="min-h-11 px-4">
                Add
              </Button>
            </form>
          )}
        </section>

        <section>
          <h2 className="mb-1 text-lg font-semibold">Parents and guardians</h2>
          <p className="mb-1 text-sm text-muted">
            Each one signs in with their own email and sees only the children shown here. Tap one to change what they
            see or send their invite.
          </p>
          {f.guardians.length === 0 && <p className="text-[16px] text-muted">None yet.</p>}
          <ul className="divide-y divide-rule">
            {f.guardians.map((g) => (
              <li key={g.id}>
                <Link href={`/families/${f.id}/guardians/${g.id}`} className="flex min-h-14 items-center gap-2 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="text-[17px] font-medium">{g.name}</span>
                    {g.relationship && <span className="text-muted"> · {g.relationship}</span>}
                    <span className="block text-sm text-muted">
                      {accessLabel(g, f)} · <GuardianStatus status={g.status} />
                    </span>
                  </span>
                  <span aria-hidden className="text-xl text-accent-ink">
                    ›
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {f.students.length > 0 ? (
            <Link
              href={`/families/${f.id}/guardians/new`}
              className="mt-2 inline-flex min-h-11 items-center text-[16px] font-semibold text-accent-ink"
            >
              + Add a parent or guardian
            </Link>
          ) : (
            <p className="mt-2 text-sm text-muted">Add a child first, then the people who can see them.</p>
          )}
        </section>

        <details>
          <summary className="cursor-pointer text-[16px] font-semibold text-muted">Rename or delete this family</summary>
          <div className="mt-3 flex flex-col gap-4">
            <form action={renameFamily} className="flex flex-wrap gap-2">
              <input type="hidden" name="family_id" value={f.id} />
              <Input name="name" defaultValue={f.name} required className="min-w-0 flex-1" aria-label="Family name" />
              <Button variant="secondary" className="min-h-11 px-4">
                Save name
              </Button>
            </form>
            <form action={deleteFamily}>
              <input type="hidden" name="family_id" value={f.id} />
              <ConfirmSubmit
                message={`Delete ${f.name}? The children and guardians stay, and nobody loses access; they just aren't grouped any more.`}
                className="text-sm text-danger underline"
              >
                Delete family
              </ConfirmSubmit>
            </form>
          </div>
        </details>
      </div>
    </Shell>
  );
}
