import Link from "next/link";
import type { ReactNode } from "react";

// Pieces shared by the teacher desk pages.

export function Stat({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-2xl border border-rule bg-sheet px-3 py-2.5">
      <div className="text-[12px] font-semibold uppercase tracking-[0.1em] text-accent-ink">{label}</div>
      <div className="mt-0.5 text-lg font-semibold leading-tight">{value}</div>
      <div className="text-xs text-muted">{detail}</div>
    </div>
  );
}

export function Info({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[96px_1fr] gap-3 px-4 py-2.5">
      <div className="pt-0.5 text-[12px] font-semibold uppercase tracking-[0.1em] text-accent-ink">{label}</div>
      <div className="min-w-0 whitespace-pre-line">{children}</div>
    </div>
  );
}

/** A big rounded button that opens another desk page. */
export function DeskLink({ href, title, detail }: { href: string; title: string; detail: string }) {
  return (
    <Link
      href={href}
      className="flex min-h-14 items-center gap-3 rounded-2xl border border-accent/30 bg-accent-soft px-4 py-2.5 transition hover:border-accent active:scale-[0.99]"
    >
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-accent-ink">{title}</span>
        <span className="block truncate text-sm text-muted">{detail}</span>
      </span>
      <span className="text-xl text-accent-ink" aria-hidden>
        ›
      </span>
    </Link>
  );
}

