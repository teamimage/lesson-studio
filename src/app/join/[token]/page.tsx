import { Suspense } from "react";
import Link from "next/link";
import { Button, Input, Notice } from "@/components/ui";
import { PasswordInput } from "@/components/password-input";
import { createClient } from "@/lib/supabase/server";
import { INVITE_TOKEN } from "@/lib/role";
import { signOut } from "@/app/login/actions";
import { acceptInvite, joinWithPassword, sendJoinCode, verifyJoinCode } from "../actions";

type Params = Promise<{ token: string }>;
type SP = Promise<{ email?: string; error?: string; for?: string; pw?: string }>;

const ERRORS: Record<string, string> = {
  email: "Enter your email address.",
  send: "We couldn't send the email. Try again in a minute.",
  code: "That code didn't work. Check it, or send a new one.",
  password: "That email and password don't match. Use the emailed code instead.",
  invite: "This invite can't be used any more. Ask the teacher for a new link.",
  used: "This invite was already used by someone else. Ask the teacher for a new link.",
  revoked: "The teacher cancelled this invite. Ask them for a new link.",
  expired: "This invite has expired. Ask the teacher for a new link.",
  invalid: "This invite link isn't right. Check you copied all of it.",
  signin: "Sign in first.",
  join: "Couldn't join. Try again, or ask the teacher for a new link.",
};

// The page an invited parent opens. Shows who invited them, signs them in
// with their email (a 6-digit code, or their password), and links their
// account to the child. No sign-in needed to see it.
export default function JoinPage({ params, searchParams }: { params: Params; searchParams: SP }) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center gap-6 px-5 py-10">
      <Suspense fallback={<div className="h-64 animate-pulse rounded-2xl bg-sheet" />}>
        <Body params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Body({ params, searchParams }: { params: Params; searchParams: SP }) {
  const { token } = await params;
  const sp = await searchParams;
  const supabase = await createClient();
  const [{ data: claims }, preview] = await Promise.all([
    supabase.auth.getClaims(),
    INVITE_TOKEN.test(token)
      ? supabase.rpc("family_invite_preview", { p_token: token })
      : Promise.resolve({ data: null }),
  ]);
  const invite = preview.data?.[0] ?? null;
  const email = (claims?.claims?.email as string | undefined) ?? null;
  const signedIn = !!claims?.claims?.sub;
  const error = sp.error ? (ERRORS[sp.error] ?? ERRORS.join) : null;

  if (!invite) {
    return (
      <Frame title="Invite not found">
        <p className="text-[16px]">{ERRORS.invalid}</p>
        <Link href="/login" className="text-sm text-accent-ink underline">
          Go to sign in
        </Link>
      </Frame>
    );
  }

  const child = invite.student_first_name;
  const teacher = invite.teacher_name;

  if (invite.state !== "pending" && !(invite.state === "accepted" && signedIn)) {
    return (
      <Frame title={`${child}'s practice page`}>
        <Notice tone="amber">
          {invite.state === "accepted" ? ERRORS.used : invite.state === "revoked" ? ERRORS.revoked : ERRORS.expired}
        </Notice>
        <Link href="/login" className="text-sm text-accent-ink underline">
          Already joined? Sign in
        </Link>
      </Frame>
    );
  }

  const intro = (
    <p className="text-[16px] leading-relaxed">
      <b>{teacher}</b> invited you to {child}&apos;s home practice page: the practice plan, starting and recording
      practice, practice reviews and lesson videos.
    </p>
  );

  if (signedIn) {
    return (
      <Frame title={`Join ${child}'s practice page`}>
        {intro}
        {error && <Notice tone="danger">{error}</Notice>}
        <form action={acceptInvite} className="flex flex-col gap-3">
          <input type="hidden" name="token" value={token} />
          <label htmlFor="name" className="text-sm font-semibold">
            Your name
          </label>
          <Input id="name" name="name" autoComplete="name" placeholder="e.g. Maaike Kahn" />
          <Button type="submit" variant="plum">
            Join as {child}&apos;s family
          </Button>
        </form>
        <form action={signOut} className="text-sm text-muted">
          Signed in as {email}.{" "}
          <button className="text-accent-ink underline">Not you? Sign out</button>
        </form>
      </Frame>
    );
  }

  if (sp.email) {
    return (
      <Frame title={`Join ${child}'s practice page`}>
        <p className="text-[16px] leading-relaxed">
          We emailed a 6-digit code to <strong>{sp.email}</strong>. Type it here.
        </p>
        <form action={verifyJoinCode} className="flex flex-col gap-3">
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="email" value={sp.email} />
          <label htmlFor="code" className="text-sm font-semibold">
            Code
          </label>
          <Input
            id="code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9 ]{6,12}"
            required
            autoFocus
            className="text-center text-2xl tracking-[0.3em]"
          />
          <label htmlFor="name" className="text-sm font-semibold">
            Your name
          </label>
          <Input id="name" name="name" autoComplete="name" placeholder="e.g. Maaike Kahn" />
          <Button type="submit" variant="plum">
            Join
          </Button>
          {error && <Notice tone="danger">{error}</Notice>}
        </form>
        <p className="text-sm text-muted">
          If the email has a link instead, tapping it works too, on any device: you&apos;ll land on {child}&apos;s page.
        </p>
        <Link href={`/join/${token}`} className="text-sm text-accent-ink underline">
          Use a different email or send a new code
        </Link>
      </Frame>
    );
  }

  return (
    <Frame title={`Join ${child}'s practice page`}>
      {intro}
      {error && <Notice tone="danger">{error}</Notice>}
      <form action={sendJoinCode} className="flex flex-col gap-3">
        <input type="hidden" name="token" value={token} />
        <label htmlFor="email" className="text-sm font-semibold">
          Your email
        </label>
        <Input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          defaultValue={sp.for}
          placeholder="you@example.com"
        />
        <Button type="submit" variant="plum">
          Email me a sign-in code
        </Button>
        {sp.pw ? (
          <>
            <label htmlFor="password" className="text-sm font-semibold">
              Password
            </label>
            <PasswordInput id="password" name="password" autoComplete="current-password" />
            <Button type="submit" variant="secondary" formAction={joinWithPassword} formNoValidate>
              Sign in with password and join
            </Button>
          </>
        ) : (
          <Link href={`/join/${token}?pw=1`} className="text-sm text-accent-ink underline">
            I already have a password
          </Link>
        )}
      </form>
    </Frame>
  );
}

function Frame({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <>
      <div>
        <div className="mb-2 text-4xl" aria-hidden>
          ♪
        </div>
        <div className="text-[12px] font-semibold uppercase tracking-[0.12em] text-plum">Lesson Studio · Family</div>
        <h1 className="mt-1 text-3xl font-semibold">{title}</h1>
      </div>
      <div className="flex flex-col gap-4 rounded-2xl border border-rule bg-sheet p-5 shadow-[0_1px_0_rgba(43,37,33,0.04)]">
        {children}
      </div>
    </>
  );
}
