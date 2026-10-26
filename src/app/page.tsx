import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "./login/actions";

async function SignedInAs() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const email = data?.claims?.email as string | undefined;
  return <p>Signed in as {email}.</p>;
}

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-6 p-6">
      <h1 className="text-2xl font-semibold">Lesson Studio</h1>
      <Suspense fallback={<p>&nbsp;</p>}>
        <SignedInAs />
      </Suspense>
      <p className="text-sm text-gray-500">
        Students, lessons and practice notes will live here.
      </p>
      <form action={signOut}>
        <button type="submit" className="rounded border px-3 py-2">
          Sign out
        </button>
      </form>
    </main>
  );
}
