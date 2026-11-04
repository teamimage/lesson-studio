"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deletePracticeSession, retryPracticeReview } from "@/app/family/practice-actions";

/** Keeps an unfinished session moving while it is on screen, then refreshes. */
export function PracticePoller({ id }: { id: string }) {
  const router = useRouter();
  useEffect(() => {
    let stop = false;
    async function poll() {
      while (!stop) {
        await new Promise((r) => setTimeout(r, 6000));
        if (stop) return;
        const res = await fetch(`/api/practice/${id}`, { method: "POST" }).catch(() => null);
        const body = (await res?.json().catch(() => null)) as { status?: string } | null;
        if (body?.status === "done" || body?.status === "error") {
          router.refresh();
          return;
        }
      }
    }
    poll();
    return () => {
      stop = true;
    };
  }, [id, router]);
  return null;
}

export function PracticeSessionButtons({ id, canRetry, canRedo = false }: { id: string; canRetry: boolean; canRedo?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      {canRedo && (
        <button
          type="button"
          disabled={pending}
          className="font-medium text-accent-ink underline disabled:opacity-50"
          onClick={() =>
            start(async () => {
              setMsg("Writing the review again…");
              await retryPracticeReview(id);
              setMsg(null);
              router.refresh();
            })
          }
        >
          Review again
        </button>
      )}
      {canRetry && (
        <button
          type="button"
          disabled={pending}
          className="font-medium text-accent-ink underline disabled:opacity-50"
          onClick={() =>
            start(async () => {
              setMsg("Reviewing again…");
              await retryPracticeReview(id);
              setMsg(null);
              router.refresh();
            })
          }
        >
          Try again
        </button>
      )}
      <button
        type="button"
        disabled={pending}
        className="text-muted underline disabled:opacity-50"
        onClick={() => {
          if (!window.confirm("Delete this practice session and its review? Ticks already in the practice log stay.")) return;
          start(async () => {
            await deletePracticeSession(id);
            router.refresh();
          });
        }}
      >
        Delete
      </button>
      {msg && <span className="text-muted">{msg}</span>}
    </div>
  );
}
