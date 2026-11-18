// Version 3 (the task-first design: Today, one timeline per student, the
// lesson as a story, Family mode, Setup) is the only version of the app since
// Nov 18 2026. The older "Current" and "Proposed" structures were retired.
//
// Version 3 has its own pages under /v3 for the screens it redesigned. Older
// page URLs it replaced (saved links, bookmarks, redirects from server
// actions) are sent to the version 3 page by the proxy for teachers. Family
// accounts keep their own pages (/family, /settings) and are never moved.

const ID = "[0-9a-fA-F-]{8,}";

/** The version 3 page that replaces an older page, or null when the path is still current. */
export function v3PathFor(pathname: string): string | null {
  if (pathname === "/" || pathname === "/teacher") return "/v3";
  if (pathname === "/settings") return "/v3/setup";
  if (pathname === "/family") return "/v3/family";
  let m = pathname.match(new RegExp(`^/(?:students|teacher)/(${ID})$`));
  if (m) return `/v3/students/${m[1]}`;
  m = pathname.match(new RegExp(`^/lessons/(${ID})$`));
  if (m) return `/v3/lessons/${m[1]}`;
  m = pathname.match(new RegExp(`^/family/(${ID})$`));
  if (m) return `/v3/family/${m[1]}`;
  return null;
}
