import { Suspense } from "react";
import { Shell } from "@/components/shell";
import { Button, Card, Field, Input, Notice, SectionTitle } from "@/components/ui";
import { getViewer } from "@/lib/auth";
import { signOut } from "@/app/login/actions";
import { setPassword, updateTeacher } from "./actions";

const PASSWORD_NOTICES: Record<string, { tone: "sage" | "danger" | "plum"; text: string }> = {
  saved: { tone: "sage", text: "Password saved. Next time, sign in with your email and this password." },
  reset: { tone: "plum", text: "You're signed in. Choose a new password below." },
  short: { tone: "danger", text: "Use at least 8 characters." },
  mismatch: { tone: "danger", text: "The two passwords don't match." },
  same: { tone: "danger", text: "That's already your password. Choose a different one." },
  weak: { tone: "danger", text: "That password is too easy to guess. Try a longer one." },
  failed: { tone: "danger", text: "We couldn't save the password. Sign out and back in, then try again." },
};

type SP = Promise<{ saved?: string; password?: string }>;

export default function SettingsPage({ searchParams }: { searchParams: SP }) {
  return (
    <Shell title="Settings" tab="settings">
      <Suspense>
        <Body searchParams={searchParams} />
      </Suspense>
    </Shell>
  );
}

async function Body({ searchParams }: { searchParams: SP }) {
  const viewer = await getViewer();
  const { saved, password } = await searchParams;
  const passwordNotice = password ? PASSWORD_NOTICES[password] : undefined;
  return (
    <div className="flex flex-col gap-8">
      {saved && <Notice tone="sage">Saved.</Notice>}
      {viewer.teacher && (
        <section>
          <SectionTitle>Teacher</SectionTitle>
          <form action={updateTeacher} className="flex flex-col gap-4">
            <Field label="Your name" hint="Appears on lesson sheets, e.g. “Ms. Ana”.">
              <Input name="name" defaultValue={viewer.teacher.name} />
            </Field>
            <Field label="Studio name">
              <Input name="studio_name" defaultValue={viewer.teacher.studio_name} placeholder="Home Studio" />
            </Field>
            <Button>Save</Button>
          </form>
        </section>
      )}

      <section>
        <SectionTitle>Account</SectionTitle>
        <Card className="flex flex-col gap-3">
          <div className="text-[15px]">
            Signed in as <span className="font-medium">{viewer.email}</span>
            <div className="text-sm text-muted">
              {viewer.teacher ? "Teacher" : ""}
              {viewer.teacher && viewer.parentRows.length > 0 ? " and " : ""}
              {viewer.parentRows.length > 0 ? "parent" : ""}
            </div>
          </div>
          <form action={signOut}>
            <Button variant="secondary">Sign out</Button>
          </form>
        </Card>
      </section>

      <section id="password" className="scroll-mt-6">
        <SectionTitle>Password</SectionTitle>
        <Card className="flex flex-col gap-3">
          <p className="text-sm text-muted">
            Set a password to sign in without waiting for an email code. You can still use a code any time.
          </p>
          {passwordNotice && <Notice tone={passwordNotice.tone}>{passwordNotice.text}</Notice>}
          <form action={setPassword} className="flex flex-col gap-4">
            {/* Lets password managers save the login under the right email. */}
            <input type="email" name="username" autoComplete="username" value={viewer.email} readOnly hidden />
            <Field label="New password" hint="At least 8 characters.">
              <Input
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
                autoFocus={password === "reset"}
              />
            </Field>
            <Field label="Type it again">
              <Input name="confirm" type="password" autoComplete="new-password" minLength={8} required />
            </Field>
            <Button>Save password</Button>
          </form>
        </Card>
      </section>
    </div>
  );
}
