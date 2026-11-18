"use client";

import { useState } from "react";
import { Button, cx, inputClass } from "./ui";

/** A read-only link with a Copy button (falls back to selecting the text). */
export function CopyLink({ url, label }: { url: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const [field, setField] = useState<HTMLInputElement | null>(null);
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      field?.select();
    }
  }
  return (
    <div className="flex gap-2">
      <input
        ref={setField}
        readOnly
        value={url}
        onFocus={(e) => e.currentTarget.select()}
        className={cx(inputClass, "min-w-0 flex-1 font-mono text-[13px]")}
        aria-label={label}
      />
      <Button type="button" variant="secondary" onClick={copy} className="min-h-11 shrink-0 px-4">
        {copied ? "✓ Copied" : "Copy"}
      </Button>
    </div>
  );
}
