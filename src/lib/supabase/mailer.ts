import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Supabase client used only to send sign-in and password-reset emails.
//
// The @supabase/ssr clients always use the PKCE flow, whose email links only
// work in the same browser that asked for them (they need a cookie set at that
// moment). Phones usually open email links in a different browser, so those
// links bounced back to the sign-in page. This client uses the implicit flow:
// the link lands on /login with the session in the URL fragment, which
// EmailLinkHandler turns into a normal cookie session in any browser.
export function createMailerClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      auth: {
        flowType: "implicit",
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );
}
