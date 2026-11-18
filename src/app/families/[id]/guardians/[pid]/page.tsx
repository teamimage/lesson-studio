import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Shell } from "@/components/shell";
import { Me } from "@/components/v3/me";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { GuardianStatus } from "@/components/guardian-status";
import { InviteLink } from "@/components/invite-link";
import { LocalDateTime } from "@/components/local-time";
import { Button, Field, Input, Notice } from "@/components/ui";
import { requireTeacher } from "@/lib/auth";
import { firstName, loadFamily, namesList, shownEmail } from "@/lib/families";
import { siteOrigin } from "@/lib/family-invites";
import { cancelGuardianInvite, inviteGuardian, removeGuardian, saveGuardian } from "../../../actions";

type Params = Promise<{ id: string; pid: string }>;
type SP = Promise<{ saved?: string; error?: string; invite?: string }>;

const ERRORS: Record<string, string> = {
  name: "Add their name.",
  email: "That email doesn't look right.",
  children: "Tick at least one child, or choose the whole family.",
  taken: "Another parent in your studio already uses that email.",
  save: "Couldn't save. Try again.",
  invite: "Couldn't make the invite. Try again.",
};

const RELATIONSHIPS = ["Mother", "Father", "Parent", "Stepparent", "Grandparent", "Guardian", "Nanny", "Other"];

// One parent or guardian: who they are, which children they see, and their
// invite to sign in to the family side with their own email.
export default function GuardianPage({ params, searchParams }: { params: Params; searchParams: SP }) {
  return (
    <Suspense fallback={<Shell title=" " tab="settings" v3Tab="setup" me={<Me />}>{null}</Shell>}>
      <Body params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Body({ params, searchParams }: { params: Params; searchParams: SP }) {
  const { teacher } = await requireTeacher();
  const [{ id, pid }, sp] = await Promise.all([params, searchParams]);
  const { family: f } = await loadFamily(id);
  if (!f) notFound();
  const isNew = pid === "new";
  const g = isNew ? null : f.guardians.find((x) => x.id === pid);
  if (!isNew && !g) notFound();
  const origin = await siteOrigin();
  const seen = g ? new Set(g.children.map((c) => c.id)) : new Set<string>();
  const whole = g ? g.wholeFamily : true;
  const kids = g ? namesList(g.children.map((c) => firstName(c.name))) : "";
  const teacherName = teacher.name || teacher.studio_name || "your teacher";
  const email = g ? shownEmail(g.email) : "";

  return (
    <Shell
      title={g ? g.name : "New parent or guardian"}
      eyebrow={f.name}
      tab="settings"
      v3Tab="setup"
      me={<Me />}
      back={{ href: `/families/${f.id}`, label: f.name || "Family" }}
    >
      <div className="flex flex-col gap-8">
        {sp.saved === "1" && <Notice tone="sage">Saved.</Notice>}
        {sp.error && <Notice tone="danger">{ERRORS[sp.error] ?? ERRORS.save}</Notice>}

        {g && (
          <section id="invite" className="scroll-mt-28">
            <div className="mb-2 flex flex-wrap items-baseline gap-x-3">
              <h2 className="text-lg font-semibold">Sign-in</h2>
              <GuardianStatus status={g.status} />
            </div>
            {g.status === "signed-in" ? (
              <p className="text-[16px]">
                {g.name.split(" ")[0]} has their own sign-in{email ? ` (${email})` : ""} and sees {kids || "no children yet"}{" "}
                on Home practice. Nothing more to send.
              </p>
            ) : g.invite ? (
              <div className="flex flex-col gap-3">
                {sp.invite === "new" && <Notice tone="sage">Invite ready. Send {g.name.split(" ")[0]} this link.</Notice>}
                <p className="text-[16px]">
                  The app doesn&apos;t email invites itself yet. Copy the link, or tap Email or Text to send it from your own
                  phone. {g.name.split(" ")[0]} opens it, types their email, and gets a 6-digit sign-in code by email.
                </p>
                <InviteLink
                  url={`${origin}/join/${g.invite.token}`}
                  childName={kids}
                  teacherName={teacherName}
                  email={email}
                />
                <p className="text-sm text-muted">
                  Made <LocalDateTime iso={g.invite.created_at} />. Works once, until{" "}
                  <LocalDateTime iso={g.invite.expires_at} />.
                </p>
                <form action={cancelGuardianInvite}>
                  <input type="hidden" name="family_id" value={f.id} />
                  <input type="hidden" name="parent_id" value={g.id} />
                  <ConfirmSubmit message="Cancel this invite? The link will stop working." className="text-sm text-danger underline">
                    Cancel invite
                  </ConfirmSubmit>
                </form>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {sp.invite === "cancelled" && <Notice tone="amber">Invite cancelled.</Notice>}
                <p className="text-[16px]">
                  Make a private link for {g.name.split(" ")[0]}. They sign in with their own email and see only{" "}
                  {kids || "the children ticked below"}: the practice plan, practice recording, reviews and lesson videos.
                  Never your notes, the balance, Craft or Settings.
                </p>
                <form action={inviteGuardian}>
                  <input type="hidden" name="family_id" value={f.id} />
                  <input type="hidden" name="parent_id" value={g.id} />
                  <Button variant="plum">Make invite link</Button>
                </form>
              </div>
            )}
          </section>
        )}

        <section>
          {g && <h2 className="mb-2 text-lg font-semibold">Details</h2>}
          <form action={saveGuardian} className="flex flex-col gap-4">
            <input type="hidden" name="family_id" value={f.id} />
            {g && <input type="hidden" name="parent_id" value={g.id} />}
            <Field label="Name">
              <Input name="name" defaultValue={g?.name ?? ""} required autoComplete="off" placeholder="e.g. Maaike Kahn" />
            </Field>
            <Field label="Relationship">
              <Input
                name="relationship"
                list="relationships"
                defaultValue={g?.relationship ?? ""}
                autoComplete="off"
                placeholder="Mother, Father, Grandparent…"
              />
              <datalist id="relationships">
                {RELATIONSHIPS.map((r) => (
                  <option key={r} value={r} />
                ))}
              </datalist>
            </Field>
            <Field label="Email" hint="Optional. They can sign in with a different one when they accept the invite.">
              <Input name="email" type="email" defaultValue={email} autoComplete="off" />
            </Field>
            <Field label="Phone">
              <Input name="phone" type="tel" defaultValue={g?.phone ?? ""} autoComplete="off" />
            </Field>

            <fieldset className="flex flex-col gap-1">
              <legend className="mb-1 text-sm font-semibold">Can see</legend>
              <label className="flex min-h-10 items-center gap-2.5 text-[16px]">
                <input type="radio" name="access" value="all" defaultChecked={whole} className="size-5" />
                The whole family{f.students.length > 1 ? ` (${namesList(f.students.map((s) => firstName(s.name)))})` : ""}
              </label>
              <label className="flex min-h-10 items-center gap-2.5 text-[16px]">
                <input type="radio" name="access" value="some" defaultChecked={!whole} className="size-5" />
                Only these children:
              </label>
              {f.students.map((s) => (
                <label key={s.id} className="ml-8 flex min-h-10 items-center gap-2.5 text-[16px]">
                  <input
                    type="checkbox"
                    name="student_id"
                    value={s.id}
                    defaultChecked={whole || seen.has(s.id)}
                    className="size-5"
                  />
                  {s.name}
                </label>
              ))}
            </fieldset>

            <label className="flex min-h-10 items-center gap-2.5 text-[16px]">
              <input type="checkbox" name="supervises_practice" defaultChecked={g?.supervises_practice ?? true} className="size-5" />
              Supervises practice
            </label>
            <Button className="self-start">{g ? "Save" : "Add"}</Button>
          </form>
        </section>

        {g && (
          <form action={removeGuardian}>
            <input type="hidden" name="family_id" value={f.id} />
            <input type="hidden" name="parent_id" value={g.id} />
            <ConfirmSubmit
              message={`Remove ${g.name}? They lose access to every child and their invite stops working.`}
              className="text-sm text-danger underline"
            >
              Remove {g.name.split(" ")[0]}
            </ConfirmSubmit>
          </form>
        )}
      </div>
    </Shell>
  );
}
