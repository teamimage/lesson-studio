// Three versions of the app share the same data: "current" (as built),
// "proposed" (the structure from the Nov 2026 site-map review) and "v3" (the
// task-first redesign: Today, one timeline per student, the lesson as a
// story, Family mode, Setup). The choice lives in a cookie so server pages,
// the proxy and the header all see it.
export type UiVersion = "current" | "proposed" | "v3";
export const UI_COOKIE = "ls_ui";

export function parseUiVersion(v: string | undefined | null): UiVersion {
  return v === "proposed" || v === "v3" ? v : "current";
}

// Runs in <head> before the page paints, so header styles switch without a flash.
export const UI_BOOT_SCRIPT = `try{var m=document.cookie.match(/(?:^|; )${UI_COOKIE}=([^;]+)/);var v=m&&m[1];document.documentElement.dataset.ui=v==="proposed"||v==="v3"?v:"current"}catch(e){}`;

const ID = "[0-9a-fA-F-]{8,}";

/**
 * Version 3 has its own pages under /v3 for the screens it redesigns. Opening
 * one of the older pages it replaces, while version 3 is chosen, goes to the
 * version 3 page instead (and back again when another version is chosen), so
 * every existing link and redirect lands in the version being looked at.
 * Returns null when the path has no counterpart.
 */
export function v3PathFor(pathname: string): string | null {
  if (pathname === "/" || pathname === "/teacher") return "/v3";
  if (pathname === "/settings" || pathname === "/admin") return "/v3/setup";
  if (pathname === "/family") return "/v3/family";
  let m = pathname.match(new RegExp(`^/(?:students|teacher)/(${ID})$`));
  if (m) return `/v3/students/${m[1]}`;
  m = pathname.match(new RegExp(`^/lessons/(${ID})$`));
  if (m) return `/v3/lessons/${m[1]}`;
  m = pathname.match(new RegExp(`^/family/(${ID})$`));
  if (m) return `/v3/family/${m[1]}`;
  return null;
}

/** The older page a version 3 page stands in for. */
export function classicPathFor(pathname: string): string | null {
  if (pathname === "/v3") return "/teacher";
  if (pathname === "/v3/setup") return "/settings";
  if (pathname.startsWith("/v3/")) return pathname.slice(3);
  return null;
}
