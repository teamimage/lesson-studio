import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";
import { ROLE_COOKIE, parseRoleCookie } from "@/lib/role";
import { v3PathFor } from "@/lib/ui-version";

export async function proxy(request: NextRequest) {
  const response = await updateSession(request);
  if (response.status >= 300 && response.status < 400) return response;
  // Family accounts use the standard pages, never the version 3 ones.
  if (parseRoleCookie(request.cookies.get(ROLE_COOKIE)?.value)?.role === "family") return response;
  return versionRoute(request, response);
}

// Teachers: the older pages that version 3 replaced open as their /v3 page.
// Only page loads (GET), so form posts and server actions are never moved.
function versionRoute(request: NextRequest, response: NextResponse) {
  if (request.method !== "GET") return response;
  const target = v3PathFor(request.nextUrl.pathname);
  if (!target) return response;
  const url = request.nextUrl.clone();
  url.pathname = target;
  const redirect = NextResponse.redirect(url);
  // Keep any refreshed sign-in cookies.
  for (const c of response.cookies.getAll()) redirect.cookies.set(c);
  return redirect;
}

export const config = {
  // Skip static files and images.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
