"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { activityFromFile } from "@/lib/practice/listen-file";

// "This was a practice, not a lesson" and the other way round: a small link
// on a draft lesson and on a practice session card. Maaike teaches and also
// practises with the children, so a recording can be saved as the wrong kind;
// it can be switched until the lesson is approved. See src/lib/convert.ts.

type Result = { ok: true; href: string } | { ok: false; error: string };

async function post(body: unknown): Promise<Result> {
  const res = await fetch("/api/convert", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => null);
  const out = (await res?.json().catch(() => null)) as Result | null;
  return out ?? { ok: false, error: "Couldn't reach the server. Try again." };
}

export function LessonToPractice({ lessonId, studentName }: { lessonId: string; studentName: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    const ok = window.confirm(
      `Switch this to a practice session for ${studentName}?\n\n` +
        "It gets a practice review and goes on the practice calendar for that day. " +
        "This draft lesson, its notes and its video are deleted (practice recordings aren't kept once reviewed).",
    );
    if (!ok) return;
    setError(null);
    let activity: unknown = [];
    setBusy("Getting the recording…");
    const audio = await fetch("/api/convert", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "lesson-audio", lessonId }),
    })
      .then((r) => r.json() as Promise<{ url?: string | null }>)
      .catch(() => ({ url: null }));
    if (audio.url) {
      try {
        setBusy("Listening through the recording… 0%");
        activity = await activityFromFile(audio.url, (f) => setBusy(`Listening through the recording… ${Math.round(f * 100)}%`));
      } catch {
        // The review then works from the transcript alone.
        activity = [];
      }
    }
    setBusy("Writing the practice review… (a minute or two)");
    const out = await post({ kind: "lesson-to-practice", lessonId, activity });
    if (!out.ok) {
      setBusy(null);
      setError(out.error);
      return;
    }
    router.push(out.href);
  }

  return (
    <div className="text-sm">
      {busy ? (
        <span className="text-muted">{busy}</span>
      ) : (
        <button type="button" className="text-muted underline" onClick={run}>
          This was a practice, not a lesson
        </button>
      )}
      {error && <span className="ml-2 text-danger">{error}</span>}
    </div>
  );
}

export function PracticeToLesson({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    const ok = window.confirm(
      "Switch this to a lesson?\n\n" +
        "Its minutes and ticks come off the practice log, and a draft lesson is made for that day from what was said. " +
        "The practice review is deleted. The recording itself was already deleted after the review, so the lesson has no video.",
    );
    if (!ok) return;
    setError(null);
    setBusy(true);
    const out = await post({ kind: "practice-to-lesson", sessionId });
    if (!out.ok) {
      setBusy(false);
      setError(out.error);
      return;
    }
    router.push(out.href);
  }

  return (
    <>
      {busy ? (
        <span className="text-muted">Drafting the lesson… (a minute or two)</span>
      ) : (
        <button type="button" className="text-muted underline" onClick={run}>
          This was a lesson
        </button>
      )}
      {error && <span className="text-danger">{error}</span>}
    </>
  );
}
