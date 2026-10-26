import { Suspense } from "react";
import { sendMagicLink, verifyCode } from "./actions";

const ERRORS: Record<string, string> = {
  email: "Enter your email address.",
  send: "We couldn't send the email. Try again in a minute.",
  link: "That sign-in link has expired or was already used. Enter the code from the email instead, or send a new one.",
  code: "That code didn't work. Check it, or send a new one.",
};

const input = "rounded border px-3 py-2";
const primary =
  "rounded bg-black px-3 py-2 text-white dark:bg-white dark:text-black";

type SearchParams = Promise<{ email?: string; error?: string }>;

async function LoginForm({ searchParams }: { searchParams: SearchParams }) {
  const { email, error } = await searchParams;
  const message = error && ERRORS[error];

  // Step 2: the email was sent. Let the user type the code.
  if (email) {
    return (
      <div className="flex flex-col gap-4">
        <p>
          We emailed a sign-in code to <strong>{email}</strong>. Type it below,
          or click the link in the email.
        </p>
        <form action={verifyCode} className="flex flex-col gap-3">
          <input type="hidden" name="email" value={email} />
          <label htmlFor="code" className="text-sm font-medium">
            Code
          </label>
          <input
            id="code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9 ]{6,12}"
            required
            autoFocus
            className={`${input} tracking-widest`}
          />
          <button type="submit" className={primary}>
            Sign in
          </button>
          {message && <p className="text-sm text-red-600">{message}</p>}
        </form>
        <a href="/login" className="text-sm underline">
          Use a different email or send a new code
        </a>
      </div>
    );
  }

  // Step 1: ask for the email address.
  return (
    <form action={sendMagicLink} className="flex flex-col gap-3">
      <label htmlFor="email" className="text-sm font-medium">
        Email
      </label>
      <input
        id="email"
        name="email"
        type="email"
        required
        autoComplete="email"
        className={input}
      />
      <button type="submit" className={primary}>
        Email me a sign-in code
      </button>
      {message && <p className="text-sm text-red-600">{message}</p>}
    </form>
  );
}

export default function LoginPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-6">
      <h1 className="text-2xl font-semibold">Lesson Studio</h1>
      <Suspense>
        <LoginForm searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
