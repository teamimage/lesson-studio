"use client";

import { useState } from "react";
import { Button, cx, inputClass } from "./ui";

// One invite link with ways to send it: copy, the phone's share sheet,
// an email or a text from the teacher's own apps. Nothing is sent by the
// app itself (no mail service yet).
export function InviteLink({
  url,
  childName,
  teacherName,
  email,
}: {
  url: string;
  childName: string;
  teacherName: string;
  email: string;
}) {
  const [copied, setCopied] = useState(false);
  const subject = `${childName}'s practice page`;
  const message =
    `Hi! Here is your invite to ${childName}'s home practice page with ${teacherName}: ` +
    `the practice plan, practice recordings, reviews and lesson videos.\n\n` +
    `Open this link and sign in with your email:\n${url}\n\nThe link works once and expires in 30 days.`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      window.prompt("Copy this link", url);
    }
  }

  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ title: subject, text: message });
        return;
      } catch {
        return; // cancelled
      }
    }
    copy();
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        readOnly
        value={url}
        onFocus={(e) => e.currentTarget.select()}
        className={cx(inputClass, "font-mono text-[13px]")}
        aria-label="Invite link"
      />
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={copy} className="min-h-10 px-4">
          {copied ? "✓ Copied" : "Copy link"}
        </Button>
        <Button type="button" variant="secondary" onClick={share} className="min-h-10 px-4">
          Share…
        </Button>
        <a
          href={`mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`}
          className="inline-flex min-h-10 items-center rounded-xl border border-rule bg-sheet px-4 text-sm font-semibold text-ink hover:border-accent/50"
        >
          Email
        </a>
        <a
          href={`sms:?&body=${encodeURIComponent(message)}`}
          className="inline-flex min-h-10 items-center rounded-xl border border-rule bg-sheet px-4 text-sm font-semibold text-ink hover:border-accent/50"
        >
          Text
        </a>
      </div>
    </div>
  );
}
