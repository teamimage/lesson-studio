import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./types";

// Supabase client for the /admin pages only. It is the signed-in user's
// normal session plus the `x-lesson-admin` header, which turns on the
// "admin manages all" database rules for users listed in app_admins.
// Everyone else gets nothing extra from the header.
export async function createAdminClient() {
  const cookieStore = await cookies();
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      global: { headers: { "x-lesson-admin": "1" } },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Read-only in Server Components; the proxy refreshes the session.
          }
        },
      },
    },
  );
}
