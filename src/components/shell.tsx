import Link from "next/link";
import type { ReactNode } from "react";
import { cx } from "./ui";

type Tab = "studio" | "desk" | "family" | "settings";

// Page frame: header with optional back link, content column, bottom tabs on
// phones. Keep it free of session reads so it prerenders instantly.
export function Shell({
  title,
  eyebrow,
  back,
  actions,
  tab,
  children,
  wide,
}: {
  title: ReactNode;
  eyebrow?: ReactNode;
  back?: { href: string; label: string };
  actions?: ReactNode;
  tab?: Tab;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="no-print sticky top-0 z-10 border-b border-rule/80 bg-paper/90 backdrop-blur supports-[backdrop-filter]:bg-paper/75">
        <div
          className={cx(
            "mx-auto flex w-full items-center gap-3 px-4 py-3",
            wide ? "max-w-5xl" : "max-w-2xl",
          )}
        >
          {back ? (
            <Link
              href={back.href}
              className="-ml-1 flex min-h-10 items-center gap-1 rounded-lg px-1 text-accent-ink"
            >
              <span aria-hidden>‹</span>
              <span className="text-sm font-medium">{back.label}</span>
            </Link>
          ) : (
            <Link href="/" className="font-display text-lg font-semibold">
              Lesson Studio
            </Link>
          )}
          <div className="ml-auto flex items-center gap-2">{actions}</div>
        </div>
      </header>

      <main
        className={cx(
          "mx-auto w-full flex-1 px-4 pb-28 pt-5",
          wide ? "max-w-5xl" : "max-w-2xl",
        )}
      >
        <div className="mb-5">
          {eyebrow && (
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-accent-ink">
              {eyebrow}
            </div>
          )}
          <h1 className="text-[28px] font-semibold leading-tight">{title}</h1>
        </div>
        {children}
      </main>

      <nav className="no-print fixed inset-x-0 bottom-0 z-10 border-t border-rule bg-sheet/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <div className="mx-auto grid max-w-2xl grid-cols-4">
          <TabLink href="/" active={tab === "studio"} label="Studio" icon="♪" />
          <TabLink href="/teacher" active={tab === "desk"} label="Desk" icon="▦" />
          <TabLink href="/family" active={tab === "family"} label="Home practice" icon="⌂" />
          <TabLink href="/settings" active={tab === "settings"} label="Settings" icon="⚙" />
        </div>
      </nav>
    </div>
  );
}

function TabLink({
  href,
  label,
  icon,
  active,
}: {
  href: string;
  label: string;
  icon: string;
  active?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cx(
        "flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-medium",
        active ? "text-accent-ink" : "text-muted",
      )}
    >
      <span className="text-lg leading-none" aria-hidden>
        {icon}
      </span>
      {label}
    </Link>
  );
}
