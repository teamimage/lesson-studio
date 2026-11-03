"use client";

import { useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { UI_COOKIE, classicPathFor, parseUiVersion, v3PathFor, type UiVersion } from "@/lib/ui-version";

// Dropdown in the header that flips the whole app between the current, the
// proposed and the version 3 layout. Same data in all three; only views and
// tools differ. Version 3 has its own pages, so moving into or out of it
// opens the matching page.
const EVENT = "ls-ui-change";

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  return () => window.removeEventListener(EVENT, cb);
}
const read = (): UiVersion => parseUiVersion(document.documentElement.dataset.ui);
const readServer = (): UiVersion => "current";

export function VersionSwitch() {
  const router = useRouter();
  const version = useSyncExternalStore(subscribe, read, readServer);
  const [pending, startTransition] = useTransition();

  function change(next: UiVersion) {
    // Read at change time (not usePathname) so the header stays prerendered.
    const pathname = window.location.pathname;
    document.cookie = `${UI_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    document.documentElement.dataset.ui = next;
    window.dispatchEvent(new Event(EVENT));
    const target =
      next === "v3" ? (v3PathFor(pathname) ?? (pathname.startsWith("/v3") ? null : "/v3")) : classicPathFor(pathname);
    startTransition(() => (target && target !== pathname ? router.push(target) : router.refresh()));
  }

  return (
    <label className="flex items-center">
      <span className="sr-only">App version</span>
      <select
        value={version}
        onChange={(e) => change(parseUiVersion(e.target.value))}
        className="min-h-9 rounded-lg border border-rule bg-sheet px-2 text-sm font-medium text-ink"
        aria-busy={pending}
      >
        <option value="current">Current</option>
        <option value="proposed">Proposed</option>
        <option value="v3">Version 3</option>
      </select>
    </label>
  );
}
