import { Suspense } from "react";
import { Button, Input, Notice } from "@/components/ui";
import { EmailLinkHandler } from "./email-link-handler";
import { sendMagicLink, sendPasswordReset, signInWithPassword, verifyCode } from "./actions";

const ERRORS: Record<string, string> = {
  email: "Enter your email address.",
  send: "We couldn't send the email. Try again in a minute.",
  link: "That sign-in link has expired or was already used. Send a new one below.",
  code: "That code didn't work. Check it, or send a new one.",
  password:
    "That email and password don't match. If you haven't set a password yet, tap “Forgot password?” to create one.",
  nopassword: "Enter your password, or tap “Email me a sign-in link”.",
};

type SearchParams = Promise<{
  email?: string;
  error?: string;
  /** Email to prefill after a failed attempt. */
  for?: string;
  mode?: string;
  /** Email a password reset link was sent to. */
  sent?: string;
}>;

async function LoginForm({ searchParams }: { searchParams: SearchParams }) {
  const { email, error, for: prefill, mode, sent } = await searchParams;
  const message = error && ERRORS[error];

  if (mode === "reset") {
    if (sent) {
      return (
        <div className="flex flex-col gap-4">
          <p className="text-[15px] leading-relaxed">
            We emailed a link to <strong>{sent}</strong>. Tap it, and you&apos;ll be signed in and taken to Settings to
            choose your password.
          </p>
          <a href="/login" className="text-sm text-accent-ink underline">
            Back to sign in
          </a>
        </div>
      );
    }
    return (
      <form action={sendPasswordReset} className="flex flex-col gap-3">
        <p className="text-[15px] leading-relaxed">
          Enter your email and we&apos;ll send a link to set a password. This also works if you never had one.
        </p>
        <label htmlFor="email" className="text-sm font-semibold">
          Email
        </label>
        <Input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          defaultValue={prefill}
          placeholder="you@example.com"
        />
        <Button type="submit">Email me a reset link</Button>
        {message && <Notice tone="danger">{message}</Notice>}
        <a href="/login" className="text-sm text-accent-ink underline">
          Back to sign in
        </a>
      </form>
    );
  }

  if (email) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-[15px] leading-relaxed">
          We emailed a sign-in link to <strong>{email}</strong>. Open the email and tap the link. It works on any
          device.
        </p>
        <p className="text-sm text-muted">If the email shows a 6-digit code instead, type it here.</p>
        <form action={verifyCode} className="flex flex-col gap-3">
          <input type="hidden" name="email" value={email} />
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
          <Button type="submit">Sign in</Button>
          {message && <Notice tone="danger">{message}</Notice>}
        </form>
        <a href="/login" className="text-sm text-accent-ink underline">
          Use a different email or send a new link
        </a>
      </div>
    );
  }

  return (
    <form action={signInWithPassword} className="flex flex-col gap-3">
      <label htmlFor="email" className="text-sm font-semibold">
        Email
      </label>
      <Input
        id="email"
        name="email"
        type="email"
        required
        autoComplete="username"
        defaultValue={prefill}
        placeholder="you@example.com"
      />
      <div className="flex items-baseline justify-between">
        <label htmlFor="password" className="text-sm font-semibold">
          Password
        </label>
        <a href="/login?mode=reset" className="text-sm text-accent-ink underline">
          Forgot password?
        </a>
      </div>
      <Input id="password" name="password" type="password" autoComplete="current-password" />
      <Button type="submit">Sign in</Button>
      {message && <Notice tone="danger">{message}</Notice>}
      <div className="flex items-center gap-3 text-xs text-muted" aria-hidden>
        <span className="h-px flex-1 bg-rule" />
        or
        <span className="h-px flex-1 bg-rule" />
      </div>
      <Button type="submit" variant="secondary" formAction={sendMagicLink} formNoValidate>
        Email me a sign-in link
      </Button>
    </form>
  );
}

export default function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-sm flex-col justify-center gap-6 px-5 py-10">
      <div>
        <div className="mb-2 text-4xl" aria-hidden>
          ♪
        </div>
        <h1 className="text-3xl font-semibold">Lesson Studio</h1>
        <p className="mt-1 text-muted">Lesson notes, practice plans and parent sheets, in one place.</p>
      </div>
      <div className="rounded-2xl border border-rule bg-sheet p-5 shadow-[0_1px_0_rgba(43,37,33,0.04)]">
        <EmailLinkHandler>
          <Suspense>
            <LoginForm searchParams={searchParams} />
          </Suspense>
        </EmailLinkHandler>
      </div>
      <p className="text-xs text-muted">
        Teachers and parents use the same sign-in. Parents see the children their teacher linked to their email.
      </p>
    </main>
  );
}
