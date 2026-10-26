import { Suspense } from "react";
import { Button, Input, Notice } from "@/components/ui";
import { sendMagicLink, verifyCode } from "./actions";

const ERRORS: Record<string, string> = {
  email: "Enter your email address.",
  send: "We couldn't send the email. Try again in a minute.",
  link: "That sign-in link has expired or was already used. Enter the code from the email instead, or send a new one.",
  code: "That code didn't work. Check it, or send a new one.",
};

type SearchParams = Promise<{ email?: string; error?: string }>;

async function LoginForm({ searchParams }: { searchParams: SearchParams }) {
  const { email, error } = await searchParams;
  const message = error && ERRORS[error];

  if (email) {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-[15px] leading-relaxed">
          We emailed a sign-in code to <strong>{email}</strong>. Type it below, or tap the link in the email.
        </p>
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
          Use a different email or send a new code
        </a>
      </div>
    );
  }

  return (
    <form action={sendMagicLink} className="flex flex-col gap-3">
      <label htmlFor="email" className="text-sm font-semibold">
        Email
      </label>
      <Input id="email" name="email" type="email" required autoComplete="email" placeholder="you@example.com" />
      <Button type="submit">Email me a sign-in code</Button>
      {message && <Notice tone="danger">{message}</Notice>}
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
        <Suspense>
          <LoginForm searchParams={searchParams} />
        </Suspense>
      </div>
      <p className="text-xs text-muted">
        Teachers and parents use the same sign-in. Parents see the children their teacher linked to their email.
      </p>
    </main>
  );
}
