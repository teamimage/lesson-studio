import Link from "next/link";
import type { ReactNode } from "react";
import { cx } from "./ui";

// Every page sits in the same Desk-width frame, centred in the window, so all
// pages share Desk's left edge and the tabs never shift. Narrow pages
// (Studio, Home practice, Settings) keep their old 42rem width but stay
// left-aligned in that frame instead of being centred on their own.
// 40rem = the old max-w-2xl (42rem) minus the frame padding.
const FRAME = "mx-auto w-full max-w-5xl px-4";
const NARROW = "max-w-[40rem]";

type Tab = "studio" | "desk" | "family" | "settings";

// Page frame: header with the back link (or app name) top left, page actions
// such as date and Edit top right, and the section tabs on a row beneath.
// No bottom bar. Keep it free of session reads so it prerenders instantly.
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
      <header className="no-print sticky top-0 z-10 border-b border-rule/80 bg-paper/90 pt-[env(safe-area-inset-top)] backdrop-blur supports-[backdrop-filter]:bg-paper/75">
        <div className={cx("pt-1", FRAME)}>
          <div className={cx("flex flex-col", !wide && NARROW)}>
            <div className="flex items-center gap-3">
              {back ? (
                <Link
                  href={back.href}
                  className="-ml-1 flex min-h-9 items-center gap-1 rounded-lg px-1 text-accent-ink"
                >
                  <span aria-hidden>‹</span>
                  <span className="text-sm font-medium">{back.label}</span>
                </Link>
              ) : (
                <Link
                  href="/"
                  className="flex min-h-9 items-center font-display text-lg font-semibold"
                >
                  Lesson Studio
                </Link>
              )}
              <div className="ml-auto flex items-center gap-2">{actions}</div>
            </div>
            <nav
              aria-label="Sections"
              className="-mx-1 flex gap-1 overflow-x-auto pb-1.5 pt-0.5"
            >
              <TabLink
                href="/teacher"
                active={tab === "desk"}
                label="Desk"
                icon="▦"
              />
              <TabLink
                href="/"
                active={tab === "studio"}
                label="Studio"
                icon="♪"
              />
              <TabLink
                href="/family"
                active={tab === "family"}
                label="Home practice"
                icon="⌂"
              />
              <TabLink
                href="/settings"
                active={tab === "settings"}
                label="Settings"
                icon="⚙"
              />
            </nav>
          </div>
        </div>
      </header>

      <main
        className={cx(
          "flex-1 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-3",
          FRAME,
        )}
      >
        <div className={cx(!wide && NARROW)}>
          <div className="mb-4">
            {eyebrow && (
              <div className="mb-1 text-[12px] font-semibold uppercase tracking-[0.12em] text-accent-ink">
                {eyebrow}
              </div>
            )}
            <h1 className="text-[27px] font-medium leading-tight">{title}</h1>
          </div>
          {children}
        </div>
      </main>
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
      aria-current={active ? "page" : undefined}
      className={cx(
        "flex min-h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[14px] font-medium",
        active ? "bg-accent-soft text-accent-ink" : "text-muted hover:text-ink",
      )}
    >
      <span className="text-sm leading-none" aria-hidden>
        {icon}
      </span>
      {label}
    </Link>
  );
}
