// Which side of the app a signed-in user belongs on. Teachers get the
// teacher tabs (and can still preview Home practice as a family); family
// accounts, made by accepting an invite from the teacher, see only Home
// practice for their own children.
//
// The proxy works this out once per sign-in (the my_role() database
// function) and keeps it in a cookie as "<role>.<user id>", so the header can
// pick its tabs before the page paints and the proxy can keep families off
// teacher pages. The cookie only steers the screens: what anyone can read is
// still decided by the database's row rules and requireTeacher().
export type Role = "teacher" | "family";
export const ROLE_COOKIE = "ls_role";

export function parseRoleCookie(v: string | undefined | null): { role: Role; userId: string } | null {
  if (!v) return null;
  const dot = v.indexOf(".");
  if (dot < 0) return null;
  const role = v.slice(0, dot);
  if (role !== "teacher" && role !== "family") return null;
  return { role, userId: v.slice(dot + 1) };
}

export const INVITE_TOKEN = /^[0-9a-f]{64}$/;

/**
 * Pages a family account may open. Everything else sends them to Home
 * practice. API routes and server actions check access themselves.
 */
export function familyMayOpen(pathname: string): boolean {
  if (pathname === "/family" || pathname.startsWith("/family/")) return true;
  if (pathname.startsWith("/join/") || pathname.startsWith("/login") || pathname.startsWith("/auth")) return true;
  if (pathname.startsWith("/api/")) return true;
  if (pathname === "/settings") return true; // their account: sign out, password
  if (/^\/students\/[0-9a-fA-F-]{8,}\/consent$/.test(pathname)) return true;
  if (/^\/recordings\/[0-9a-fA-F-]{8,}\/full$/.test(pathname)) return true;
  if (/^\/lessons\/[0-9a-fA-F-]{8,}\/sheet$/.test(pathname)) return true; // printable practice sheet
  return false;
}

// Runs in <head> with the version script: marks <html data-role="family">
// for family accounts so the header shows only the family tabs. Families
// always get the standard (Proposed) look; the version dropdown is teacher-only.
export const ROLE_BOOT_SCRIPT = `try{var r=document.cookie.match(/(?:^|; )${ROLE_COOKIE}=([^;.]+)/);var f=r&&r[1]==="family";document.documentElement.dataset.role=f?"family":"teacher";if(f)document.documentElement.dataset.ui="proposed"}catch(e){}`;
