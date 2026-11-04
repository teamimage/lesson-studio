"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, cx, textareaClass } from "./ui";

type Msg = { id: string; role: "user" | "assistant"; content: string };
export type SetProgress = { id: string; title: string; blurb: string; done: number; total: number; complete: boolean };

async function send(message: string): Promise<{ reply?: string; error?: string }> {
  const res = await fetch("/api/assistant", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message }),
  }).catch(() => null);
  const body = (await res?.json().catch(() => null)) as { reply?: string; error?: string } | null;
  if (!body) return { error: "Couldn't reach the server. Try again." };
  return body;
}

/** The chat with the teacher's teaching assistant. Opens with the next interview question. */
export function AssistantChat({
  initial,
  sets,
  basicsDone,
  current,
}: {
  initial: Msg[];
  /** The optional sets after the basics, with progress. */
  sets: SetProgress[];
  basicsDone: boolean;
  /** The set being worked on now, if any and unfinished. */
  current?: string;
}) {
  const router = useRouter();
  const [msgs, setMsgs] = useState<Msg[]>(initial);
  const [draft, setDraft] = useState("");
  // A new conversation, or one that ended on the teacher's message, opens with the next question.
  const needsOpen = !initial.length || initial[initial.length - 1].role === "user";
  const [busy, setBusy] = useState(needsOpen);
  const [error, setError] = useState<string | null>(null);
  const opened = useRef(false);
  const end = useRef<HTMLDivElement>(null);

  function apply(message: string, out: { reply?: string; error?: string }) {
    setBusy(false);
    if (out.error || !out.reply) {
      setError(out.error ?? "Something went wrong.");
      if (message) setDraft(message);
      return;
    }
    setMsgs((m) => [...m, { id: `a${Date.now()}`, role: "assistant", content: out.reply! }]);
    // The profile and tone below may have changed.
    router.refresh();
  }

  async function turn(message: string) {
    setBusy(true);
    setError(null);
    setMsgs((m) => [...m, { id: `u${Date.now()}`, role: "user", content: message }]);
    apply(message, await send(message));
  }

  useEffect(() => {
    if (!needsOpen || opened.current) return;
    opened.current = true;
    void send("").then((out) => apply("", out));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [msgs.length, busy]);

  function submit() {
    const text = draft.trim();
    if (!text || busy) return;
    setDraft("");
    void turn(text);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex max-h-[60vh] flex-col gap-2 overflow-y-auto rounded-2xl border border-rule bg-sheet p-3">
        {msgs.map((m) => (
          <div
            key={m.id}
            className={cx(
              "max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-[16px] leading-relaxed",
              m.role === "user" ? "self-end bg-accent-soft" : "self-start bg-sage-soft",
            )}
          >
            {m.content}
          </div>
        ))}
        {busy && <div className="self-start px-3 py-2 text-sm text-muted">Thinking…</div>}
        {!msgs.length && !busy && <div className="text-sm text-muted">Starting the interview…</div>}
        <div ref={end} />
      </div>
      {basicsDone && !busy && sets.some((s) => !s.complete) && (
        <div className="flex flex-col gap-2">
          <div className="text-sm text-muted">
            {current ? "Or switch to another set of questions:" : "Pick the next set of questions, or stop here and come back any time:"}
          </div>
          <div className="flex flex-wrap gap-2">
            {sets
              .filter((s) => !s.complete && s.id !== current)
              .map((s) => (
                <button
                  key={s.id}
                  type="button"
                  title={s.blurb}
                  onClick={() => void turn(`Let's do the "${s.title}" questions next.`)}
                  className="min-h-11 rounded-full border border-accent/30 bg-accent-soft px-3.5 text-sm font-medium text-accent-ink"
                >
                  {s.title}
                  <span className="ml-1.5 font-normal text-muted">
                    {s.done}/{s.total}
                  </span>
                </button>
              ))}
          </div>
        </div>
      )}
      {error && <div className="text-sm text-danger">{error}</div>}
      <textarea
        className={cx(textareaClass)}
        rows={3}
        value={draft}
        placeholder="Type or dictate your answer"
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
        }}
      />
      <Button type="button" onClick={submit} disabled={busy || !draft.trim()}>
        Send
      </Button>
    </div>
  );
}
