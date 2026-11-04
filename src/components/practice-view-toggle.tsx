"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { cx } from "./ui";
import { PRACTICE_VIEW_COOKIE, type PracticeView } from "@/lib/practice-view";

// Teacher / Family switch for Home practice in the proposed version, the same
// pill as the version 3 mode switch. Family shows the page exactly as a
// parent sees it: no overview, no teacher notes, family grade wording.
export function PracticeViewToggle({ view }: { view: PracticeView }) {
  const router = useRouter();
  const [shown, setShown] = useState(view);
  const [pending, startTransition] = useTransition();

  function pick(next: PracticeView) {
    if (next === shown) return;
    document.cookie = `${PRACTICE_VIEW_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    setShown(next);
    startTransition(() => router.refresh());
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-[15px] text-muted" aria-live="polite">
        {shown === "family" ? "Showing what the family sees." : "Showing your teacher view."}
      </p>
      <div
        className={cx("flex shrink-0 rounded-full border border-rule bg-sheet p-0.5", pending && "opacity-70")}
        role="group"
        aria-label="View"
        aria-busy={pending}
      >
        <button
          type="button"
          onClick={() => pick("teacher")}
          aria-pressed={shown === "teacher"}
          className={cx(
            "flex min-h-11 items-center rounded-full px-4 text-[16px] font-semibold",
            shown === "teacher" ? "bg-accent text-white" : "text-muted",
          )}
        >
          Teacher
        </button>
        <button
          type="button"
          onClick={() => pick("family")}
          aria-pressed={shown === "family"}
          className={cx(
            "flex min-h-11 items-center rounded-full px-4 text-[16px] font-semibold",
            shown === "family" ? "bg-plum text-white" : "text-muted",
          )}
        >
          Family
        </button>
      </div>
    </div>
  );
}
