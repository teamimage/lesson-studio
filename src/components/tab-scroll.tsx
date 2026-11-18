"use client";

import { useEffect } from "react";

// On a phone the version 3 tab row scrolls sideways (Downbeat, Today,
// Students, Teacher/Family, Admin). Bring the lit tab into view on load so
// Admin isn't hidden off the right edge while you're on it.
export function TabScroll() {
  useEffect(() => {
    for (const nav of document.querySelectorAll<HTMLElement>('nav[aria-label="Sections"]')) {
      if (nav.offsetParent === null || nav.scrollWidth <= nav.clientWidth) continue;
      const on = nav.querySelector<HTMLElement>('[aria-current="page"]');
      if (!on) continue;
      const right = on.offsetLeft + on.offsetWidth - nav.offsetLeft;
      if (right > nav.clientWidth) nav.scrollLeft = right - nav.clientWidth + 8;
    }
  }, []);
  return null;
}
