import Link from "next/link";
import type { ReactNode } from "react";
import { cx } from "./ui";
import { VersionSwitch } from "./version-switch";

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
  proposedTab,
  children,
  wide,
}: {
  title: ReactNode;
  eyebrow?: ReactNode;
  back?: { href: string; label: string };
  actions?: ReactNode;
  tab?: Tab;
  /** Tab to light up in the proposed version, when it differs (lesson day lights Desk). */
  proposedTab?: Tab;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="no-print sticky top-0 z-10 border-b border-rule/80 bg-paper/90 pt-[env(safe-area-inset-top)] backdrop-blur supports-[backdrop-filter]:bg-paper/75">
        {/* The header is always Desk width and a fixed height, so the app
            name, back link and tabs sit in exactly the same place on every
            page; only the content below changes width. */}
        <div className="mx-auto flex w-full max-w-5xl flex-col px-4 pt-1">
          <div className="flex h-10 items-center gap-3">
            {back ? (
              <Link
                href={back.href}
                className="-ml-1 flex min-h-9 items-center gap-1 rounded-lg px-1 text-accent-ink"
              >
                <span aria-hidden>‹</span>
                <span className="text-sm font-medium">{back.label}</span>
              </Link>
            ) : (
              <Link href="/" className="flex min-h-9 items-center font-display text-lg font-semibold">
                Lesson Studio
              </Link>
            )}
            <div className="ml-auto flex items-center gap-2">
              {actions}
              <VersionSwitch />
            </div>
          </div>
          <nav aria-label="Sections" className="-mx-1 flex gap-1 overflow-x-auto pb-1.5 pt-0.5 sm:justify-center">
            <TabLink href="/teacher" tab="desk" current={tab} proposed={proposedTab ?? tab} label="Desk" icon="▦" />
            <TabLink href="/" tab="studio" current={tab} proposed={proposedTab ?? tab} label="Studio" proposedLabel="Students" icon="♪" />
            <TabLink href="/family" tab="family" current={tab} proposed={proposedTab ?? tab} label="Home practice" icon="⌂" />
            <TabLink href="/settings" tab="settings" current={tab} proposed={proposedTab ?? tab} label="Settings" icon="⚙" />
          </nav>
        </div>
      </header>

      <main
        className={cx(
          "mx-auto w-full flex-1 px-4 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-3",
          wide ? "max-w-5xl" : "max-w-[50rem]",
        )}
      >
        <div className="mb-4">
          {eyebrow && (
            <div className="mb-1 text-[12px] font-semibold uppercase tracking-[0.12em] text-accent-ink">
              {eyebrow}
            </div>
          )}
          <h1 className="text-[27px] font-medium leading-tight">{title}</h1>
        </div>
        {children}
      </main>
    </div>
  );
}

// Both versions are drawn from the same markup; the classic:/proposed:
// variants (globals.css) pick the look from <html data-ui>, so the header
// stays prerendered. Proposed: 44px tall, 16px text, bold + underline cue.
function TabLink({
  href,
  label,
  proposedLabel,
  icon,
  tab,
  current,
  proposed,
}: {
  href: string;
  label: string;
  proposedLabel?: string;
  icon: string;
  tab: Tab;
  current?: Tab;
  proposed?: Tab;
}) {
  const onCurrent = current === tab;
  const onProposed = proposed === tab;
  return (
    <Link
      href={href}
      aria-current={onCurrent ? "page" : undefined}
      className={cx(
        "flex min-h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[14px] font-medium text-muted hover:text-ink",
        "proposed:min-h-11 proposed:px-4 proposed:text-[16px]",
        onCurrent && "classic:bg-accent-soft classic:text-accent-ink",
        onProposed && "proposed:bg-accent-soft proposed:font-semibold proposed:text-accent-ink proposed:underline proposed:decoration-2 proposed:underline-offset-[6px]",
      )}
    >
      <span className="text-sm leading-none proposed:text-base" aria-hidden>
        {icon}
      </span>
      {proposedLabel ? (
        <>
          <span className="proposed:hidden">{label}</span>
          <span className="hidden proposed:inline">{proposedLabel}</span>
        </>
      ) : (
        label
      )}
    </Link>
  );
}
