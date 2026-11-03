// Two versions of the app share the same data: "current" (as built) and
// "proposed" (the structure from the Nov 2026 site-map review). The choice
// lives in a cookie so server pages and the header both see it.
export type UiVersion = "current" | "proposed";
export const UI_COOKIE = "ls_ui";

export function parseUiVersion(v: string | undefined | null): UiVersion {
  return v === "proposed" ? "proposed" : "current";
}

// Runs in <head> before the page paints, so header styles switch without a flash.
export const UI_BOOT_SCRIPT = `try{var m=document.cookie.match(/(?:^|; )${UI_COOKIE}=([^;]+)/);document.documentElement.dataset.ui=m&&m[1]==="proposed"?"proposed":"current"}catch(e){}`;
