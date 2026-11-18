import Link from "next/link";
import { Suspense } from "react";
import { Shell } from "@/components/shell";
import { Me } from "@/components/v3/me";
import { Button, Input, Notice } from "@/components/ui";
import { requireTeacher } from "@/lib/auth";
import { GuardianStatus as StatusText } from "@/components/guardian-status";
import { accessLabel, firstName, loadFamilies, namesList, type Family } from "@/lib/families";
import { createFamily } from "./actions";

type SP = Promise<{ error?: string; deleted?: string }>;

// Settings → Families: every family in the studio. Tap a family to see its
// children and the parents and guardians who can sign in; "Open" goes to the
// family's own page to add guardians and send invites.
export default function FamiliesPage({ searchParams }: { searchParams: SP }) {
  return (
    <Shell title="Families" tab="settings" v3Tab="setup" me={<Me />} back={{ href: "/settings", label: "Settings" }}>
      <Suspense fallback={<div className="h-40 animate-pulse rounded-2xl bg-sheet" />}>
        <Body searchParams={searchParams} />
      </Suspense>
    </Shell>
  );
}

async function Body({ searchParams }: { searchParams: SP }) {
  await requireTeacher();
  const [{ setup, families, loose }, sp] = await Promise.all([loadFamilies(), searchParams]);
  if (!setup) {
    return <Notice tone="amber">Run families.sql in the Supabase SQL Editor once, then reload this page.</Notice>;
  }
  return (
    <div className="flex flex-col gap-6">
      {sp.deleted && <Notice tone="amber">Family deleted. Its children and guardians kept their access.</Notice>}
      <p className="text-[16px] text-muted">
        Tap a family to see its children and who can sign in to their Home practice.
      </p>

      {families.length === 0 ? (
        <p className="text-[16px]">No families yet.</p>
      ) : (
        <ul className="-mx-1 divide-y divide-rule border-y border-rule">
          {families.map((f) => (
            <FamilyRow key={f.id} family={f} />
          ))}
        </ul>
      )}

      {loose.length > 0 && (
        <section>
          <h2 className="mb-1 text-lg font-semibold">Not in a family yet</h2>
          <p className="text-[16px]">
            {loose.map((s, i) => (
              <span key={s.id}>
                {i > 0 && ", "}
                <Link href={`/students/${s.id}`} className="text-accent-ink underline">
                  {s.name}
                </Link>
              </span>
            ))}
          </p>
        </section>
      )}

      <details className="group" open={sp.error === "name"}>
        <summary className="cursor-pointer list-none text-[16px] font-semibold text-accent-ink [&::-webkit-details-marker]:hidden">
          + New family
        </summary>
        <form action={createFamily} className="mt-3 flex flex-col gap-3">
          {sp.error === "name" && <Notice tone="danger">Give the family a name.</Notice>}
          <Input name="name" placeholder="e.g. Kahn family" autoComplete="off" required />
          {loose.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-sm font-semibold">Children in it</span>
              {loose.map((s) => (
                <label key={s.id} className="flex min-h-10 items-center gap-2.5 text-[16px]">
                  <input type="checkbox" name="student_id" value={s.id} className="size-5" />
                  {s.name}
                </label>
              ))}
            </div>
          )}
          <Button className="self-start">Make family</Button>
        </form>
      </details>
    </div>
  );
}

function FamilyRow({ family: f }: { family: Family }) {
  const signedIn = f.guardians.filter((g) => g.status === "signed-in").length;
  const kids = namesList(f.students.map((s) => firstName(s.name)));
  return (
    <li>
      <details className="group">
        <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-1 py-2 [&::-webkit-details-marker]:hidden">
          <span className="min-w-0 flex-1">
            <span className="block text-[18px] font-semibold">{f.name || "Family"}</span>
            <span className="block truncate text-sm text-muted">
              {kids || "No children"} · {f.guardians.length} {f.guardians.length === 1 ? "guardian" : "guardians"}
              {f.guardians.length > 0 && `, ${signedIn} signed in`}
            </span>
          </span>
          <span aria-hidden className="text-xl text-muted transition-transform group-open:rotate-90">
            ›
          </span>
        </summary>
        <div className="flex flex-col gap-3 px-1 pb-4">
          <div>
            <div className="text-[12px] font-semibold uppercase tracking-[0.1em] text-accent-ink">Children</div>
            {f.students.length === 0 ? (
              <p className="text-[16px] text-muted">None yet.</p>
            ) : (
              <ul>
                {f.students.map((s) => (
                  <li key={s.id}>
                    <Link href={`/students/${s.id}`} className="flex min-h-10 items-center gap-2 text-[16px]">
                      <span className="font-medium text-accent-ink">{s.name}</span>
                      <span className="text-sm text-muted">{s.instrument}</span>
                      <span aria-hidden className="ml-auto text-accent-ink">›</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <div className="text-[12px] font-semibold uppercase tracking-[0.1em] text-plum">Parents and guardians</div>
            {f.guardians.length === 0 ? (
              <p className="text-[16px] text-muted">None yet.</p>
            ) : (
              <ul>
                {f.guardians.map((g) => (
                  <li key={g.id}>
                    <Link href={`/families/${f.id}/guardians/${g.id}`} className="flex min-h-11 items-center gap-2 text-[16px]">
                      <span className="min-w-0 flex-1">
                        <span className="font-medium">{g.name}</span>
                        {g.relationship && <span className="text-muted"> · {g.relationship}</span>}
                        <span className="block text-sm text-muted">
                          {accessLabel(g, f)} · <StatusText status={g.status} />
                        </span>
                      </span>
                      <span aria-hidden className="text-accent-ink">›</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <Link href={`/families/${f.id}`} className="self-start text-[16px] font-semibold text-accent-ink">
            Open {f.name || "family"} ›
          </Link>
        </div>
      </details>
    </li>
  );
}
