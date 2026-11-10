import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { ROLE_COOKIE, familyMayOpen, parseRoleCookie, type Role } from "@/lib/role";

// Paths that don't need a signed-in user. /api/jobs/ is the server calling
// itself to carry on a background job: it brings the user's access token and
// checks it there, since it has no cookies.
// /join/ is the family invite page, which shows who invited them before they sign in.
const PUBLIC_PATHS = ["/login", "/auth", "/api/jobs/", "/join/"];

// Refreshes the Supabase session cookie on every request and sends
// signed-out visitors to /login.
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Don't run code between createServerClient and getClaims():
  // it can sign users out at random.
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims;

  const { pathname } = request.nextUrl;
  if (!user && !PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  if (!user?.sub) return response;
  const userId = String(user.sub);

  const pageLoad = request.method === "GET" && !pathname.startsWith("/api/") && !pathname.startsWith("/auth");

  // Teacher or family? Asked once per sign-in, then kept in a cookie.
  let role: Role | null = null;
  const saved = parseRoleCookie(request.cookies.get(ROLE_COOKIE)?.value);
  if (saved && saved.userId === userId) {
    role = saved.role;
  } else {
    const { data, error } = await supabase.rpc("my_role");
    if (!error && (data === "teacher" || data === "family")) role = data;
    // Neither yet: if they started a family invite with this email (on the
    // invite page, maybe on another device), finish it now.
    if (!error && !role) {
      const { data: joined } = await supabase.rpc("accept_my_family_invites");
      if (joined && joined > 0) role = "family";
    }
    if (role) {
      response.cookies.set(ROLE_COOKIE, `${role}.${userId}`, {
        path: "/",
        maxAge: 31536000,
        sameSite: "lax",
      });
    }
  }

  // Families stay on the family side.
  if (role === "family" && pageLoad && !familyMayOpen(pathname)) {
    return redirectKeepingCookies(request, response, "/family");
  }

  return response;
}

function redirectKeepingCookies(request: NextRequest, response: NextResponse, pathname: string) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";
  const redirect = NextResponse.redirect(url);
  for (const c of response.cookies.getAll()) redirect.cookies.set(c);
  return redirect;
}
