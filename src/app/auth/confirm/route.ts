import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// The sign-in email links here. Exchanges the token for a session.
//
// Two link formats are accepted:
// - ?token_hash=...&type=email (our email template). Works in any browser,
//   including when the link opens in a different app than the one that asked.
// - ?code=... (Supabase's default template). Only works in the same browser
//   that requested the link, because it relies on a cookie set at that time.
//
// Password reset links (type=recovery, or ?next=/settings?password=reset from
// sendPasswordReset) land on Settings so the user can choose a new password.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");
  const next = safeNext(searchParams.get("next")) ?? (type === "recovery" ? RESET_PAGE : "/");

  const supabase = await createClient();

  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }

  return NextResponse.redirect(`${origin}/login?error=link`);
}

const RESET_PAGE = "/settings?password=reset";

// Only same-site paths, so the link can't bounce someone to another site.
function safeNext(next: string | null): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return null;
  return next;
}
