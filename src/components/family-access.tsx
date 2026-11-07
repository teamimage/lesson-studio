import { ConfirmSubmit } from "./confirm-submit";
import { InviteLink } from "./invite-link";
import { LocalDateTime } from "./local-time";
import { Button, Card, Input, Notice, Pill } from "./ui";
import { inviteState, listFamilyInvites, siteOrigin } from "@/lib/family-invites";
import type { Tables } from "@/lib/supabase/types";
import { createFamilyInvite, removeFamilyAccess, revokeFamilyInvite } from "@/app/students/invite-actions";

const MESSAGES: Record<string, { tone: "sage" | "amber" | "danger"; text: string }> = {
  new: { tone: "sage", text: "Invite ready. Send the link below to the family." },
  revoked: { tone: "amber", text: "Invite cancelled." },
  removed: { tone: "amber", text: "Family access removed." },
  error: { tone: "danger", text: "Couldn't make the invite. Try again." },
  setup: { tone: "amber", text: "Family invites need a one-time database update (family-invites.sql) before they work." },
};

// Teacher, student page: who in the family can sign in to the family side,
// invite links waiting to be used, and "Invite family" to make a new one.
export async function FamilyAccess({
  student,
  teacher,
  parents,
  flash,
  made,
}: {
  student: Tables<"students">;
  teacher: Tables<"teachers">;
  parents: Tables<"parents">[];
  flash?: string;
  made?: string;
}) {
  const [{ invites, setup }, origin] = await Promise.all([listFamilyInvites(student.id), siteOrigin()]);
  const firstName = student.name.split(" ")[0] || student.name;
  const teacherName = teacher.name || teacher.studio_name || "your teacher";
  const open = invites.filter((i) => inviteState(i) === "pending");
  const notice = flash ? MESSAGES[flash] : undefined;
  const signedIn = parents.filter((p) => p.user_id);
  const notYet = parents.filter((p) => !p.user_id);

  return (
    <div id="family-access" className="flex scroll-mt-28 flex-col gap-3">
      <div className="text-[12px] font-semibold uppercase tracking-[0.1em] text-accent-ink">Family sign-in</div>
      {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
      {!setup && !notice && <Notice tone="amber">{MESSAGES.setup.text}</Notice>}

      {signedIn.length > 0 && (
        <ul className="flex flex-col gap-2">
          {signedIn.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-2 text-[16px]">
              <Pill tone="sage">✓ signed in</Pill>
              <span>
                {p.name} <span className="text-muted">· {p.email}</span>
              </span>
              <form action={removeFamilyAccess} className="ml-auto">
                <input type="hidden" name="student_id" value={student.id} />
                <input type="hidden" name="parent_id" value={p.id} />
                <ConfirmSubmit
                  message={`Remove ${p.name}'s access to ${firstName}'s practice page?`}
                  className="text-sm text-danger underline"
                >
                  Remove access
                </ConfirmSubmit>
              </form>
            </li>
          ))}
        </ul>
      )}
      {notYet.length > 0 && (
        <p className="text-sm text-muted">
          {notYet.map((p) => p.email).join(", ")} {notYet.length === 1 ? "is" : "are"} on file but{" "}
          {notYet.length === 1 ? "hasn't" : "haven't"} signed in yet. Signing in with that email also works without an
          invite.
        </p>
      )}

      {open.map((i) => (
        <Card key={i.id} tone={i.id === made ? "plum" : undefined} className="flex flex-col gap-2">
          <div className="flex flex-wrap items-baseline gap-x-2 text-[16px]">
            <span className="font-semibold">Invite{i.name ? ` for ${i.name}` : ""}</span>
            {i.email && <span className="text-muted">{i.email}</span>}
            <span className="text-xs text-muted">
              made <LocalDateTime iso={i.created_at} />, works once, until <LocalDateTime iso={i.expires_at} />
            </span>
          </div>
          <InviteLink url={`${origin}/join/${i.token}`} childName={firstName} teacherName={teacherName} email={i.email} />
          <form action={revokeFamilyInvite}>
            <input type="hidden" name="student_id" value={student.id} />
            <input type="hidden" name="invite_id" value={i.id} />
            <ConfirmSubmit message="Cancel this invite? The link will stop working." className="text-sm text-danger underline">
              Cancel invite
            </ConfirmSubmit>
          </form>
        </Card>
      ))}

      <details className="rounded-2xl border border-dashed border-rule p-3" open={open.length === 0 && signedIn.length === 0}>
        <summary className="cursor-pointer text-[16px] font-semibold text-accent-ink">+ Invite family</summary>
        <form action={createFamilyInvite} className="mt-3 flex flex-col gap-3">
          <input type="hidden" name="student_id" value={student.id} />
          <p className="text-sm text-muted">
            Makes a private link for {firstName}&apos;s parent. They open it, sign in with their email, and see only{" "}
            {firstName}&apos;s Home practice: the plan, practice recording, reviews and lesson videos. Never your notes,
            the Desk or Settings.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input name="name" placeholder="Parent's name (optional)" autoComplete="off" />
            <Input name="email" type="email" placeholder="Their email (optional)" autoComplete="off" />
          </div>
          <Button type="submit" variant="plum" className="self-start">
            Make invite link
          </Button>
        </form>
      </details>
    </div>
  );
}
