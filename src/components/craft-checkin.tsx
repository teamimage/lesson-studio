"use client";

import { useState, useTransition } from "react";
import { checkIn } from "@/app/craft/actions";

type Answer = "yes" | "partly" | "no";
const OPTIONS: { value: Answer; label: string }[] = [
  { value: "yes", label: "Yes" },
  { value: "partly", label: "Partly" },
  { value: "no", label: "Not today" },
];

// "Did you try it?" under the day's habit: one tap, tap again to clear.
export function CraftCheckin({ runId, day, answer: initial }: { runId: string; day: number; answer: Answer | null }) {
  const [answer, setAnswer] = useState<Answer | null>(initial);
  const [, startTransition] = useTransition();

  function pick(v: Answer) {
    const next = answer === v ? null : v;
    const before = answer;
    setAnswer(next);
    startTransition(async () => {
      if (!(await checkIn(runId, day, next))) setAnswer(before);
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-muted">Did you try it?</span>
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => pick(o.value)}
          aria-pressed={answer === o.value}
          className={`min-h-9 rounded-full border px-3.5 text-sm ${
            answer === o.value ? "border-accent bg-accent text-white" : "border-rule bg-transparent text-ink hover:border-accent/50"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
