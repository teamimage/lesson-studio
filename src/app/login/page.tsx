import { Suspense } from "react";
import { sendMagicLink } from "./actions";

const ERRORS: Record<string, string> = {
  email: "Enter your email address.",
  send: "We couldn't send the link. Try again in a minute.",
  link: "That sign-in link has expired or was already used.",
};

type SearchParams = Promise<{ sent?: string; error?: string }>;

async function LoginForm({ searchParams }: { searchParams: SearchParams }) {
  const { sent, error } = await searchParams;

  if (sent) return <p>Check your email for a sign-in link.</p>;

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
        className="rounded border px-3 py-2"
      />
      <button
        type="submit"
        className="rounded bg-black px-3 py-2 text-white dark:bg-white dark:text-black"
      >
        Email me a sign-in link
      </button>
      {error && ERRORS[error] && (
        <p className="text-sm text-red-600">{ERRORS[error]}</p>
      )}
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
