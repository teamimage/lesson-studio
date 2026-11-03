"use client";

import { useEffect, useRef } from "react";

/**
 * While `open` is true, the browser/phone Back button closes the popup instead
 * of leaving the page. Opening adds a history entry (same URL); Back pops it
 * and calls `onClose`. Closing any other way (✕, Escape, tapping outside)
 * removes that entry again, so history stays as it was before the popup.
 */
export function useBackToClose(open: boolean, onClose: () => void) {
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    if (!open || typeof window === "undefined") return;
    const token = `${Date.now()}-${Math.random()}`;
    const isOurs = () => (window.history.state as { __popup?: string } | null)?.__popup === token;
    // Keep the router's own state on the entry so the page stays as it is.
    window.history.pushState({ ...(window.history.state ?? {}), __popup: token }, "");
    let popped = false;
    const onPop = () => {
      if (isOurs()) return;
      popped = true;
      closeRef.current();
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      if (popped) return;
      // Closed with ✕ (or the page moved on): drop our entry. Deferred so a
      // popup that reopens straight away (React dev remount) keeps its own.
      setTimeout(() => {
        if (isOurs()) window.history.back();
      }, 0);
    };
  }, [open]);
}
