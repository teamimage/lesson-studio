import Link from "next/link";
import type { ReactNode } from "react";
import { cx } from "./ui";
import { VersionSwitch } from "./version-switch";

type Tab = "downbeat" | "studio" | "desk" | "family" | "settings";
/** Version 3 sections. Family is a mode picked from the header, not a tab. */
export type V3Tab = "downbeat" | "today" | "students" | "family" | "setup";
const V3_OF: Record<Tab, V3Tab> = { downbeat: "downbeat", desk: "today", studio: "students", family: "family", settings: "setup" };

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
  v3Tab,
  me,
  large,
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
  /** Version 3 section to light up (defaults from `tab`). */
  v3Tab?: V3Tab;
  /** Version 3: the teacher's name, shown top right as the way into Setup. */
  me?: ReactNode;
  /** Bigger type for the whole page (version 3 Family mode). */
  large?: boolean;
}) {
  const v3 = v3Tab ?? (tab ? V3_OF[tab] : undefined);
  const familyMode = v3 === "family";
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
              <Link href="/downbeat" className="flex min-h-9 items-center font-display text-lg font-semibold">
                Lesson Studio
              </Link>
            )}
            <div className="ml-auto flex items-center gap-2">
              {actions}
              <VersionSwitch />
              <Link
                href="/v3/setup"
                aria-current={v3 === "setup" ? "page" : undefined}
                className={cx(
                  "hidden min-h-9 max-w-36 items-center gap-1 truncate rounded-full border px-3 text-sm font-medium v3:flex",
                  v3 === "setup" ? "border-accent bg-accent-soft text-accent-ink" : "border-rule bg-sheet text-ink",
                )}
              >
                <span aria-hidden>⚙</span>
                <span className="truncate">{me ?? "Setup"}</span>
              </Link>
            </div>
          </div>
          {/* Version 3: Today and Students on the left, Teacher / Family
              mode switch on the right. Family mode drops the teacher tabs. */}
          <nav aria-label="Sections" className="-mx-1 hidden items-center gap-1 overflow-x-auto pb-1.5 pt-0.5 v3:flex">
            {!familyMode && (
              <>
                <V3TabLink href="/downbeat" on={v3 === "downbeat"} label="Downbeat" icon="♩" />
                <V3TabLink href="/v3" on={v3 === "today"} label="Today" icon="☀" />
                <V3TabLink href="/v3/students" on={v3 === "students"} label="Students" icon="♪" />
              </>
            )}
            {familyMode && <span className="px-2 text-[17px] font-semibold text-plum">Family mode</span>}
            <div className="ml-auto flex shrink-0 rounded-full border border-rule bg-sheet p-0.5" role="group" aria-label="Mode">
              <Link
                href="/v3"
                aria-current={!familyMode ? "true" : undefined}
                className={cx(
                  "flex min-h-10 items-center rounded-full px-3.5 text-[15px] font-semibold",
                  !familyMode ? "bg-accent text-white" : "text-muted",
                )}
              >
                Teacher
              </Link>
              <Link
                href="/v3/family"
                aria-current={familyMode ? "true" : undefined}
                className={cx(
                  "flex min-h-10 items-center rounded-full px-3.5 text-[15px] font-semibold",
                  familyMode ? "bg-plum text-white" : "text-muted",
                )}
              >
                Family
              </Link>
            </div>
          </nav>
          <nav aria-label="Sections" className="-mx-1 flex gap-1 overflow-x-auto pb-1.5 pt-0.5 v3:hidden sm:justify-center">
            <TabLink href="/downbeat" tab="downbeat" current={tab} proposed={proposedTab ?? tab} label="Downbeat" icon="♩" />
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
          large && "text-[19px]",
        )}
      >
        <div className="mb-4">
          {eyebrow && (
            <div className="mb-1 text-[12px] font-semibold uppercase tracking-[0.12em] text-accent-ink">
              {eyebrow}
            </div>
          )}
          <h1 className={cx("font-medium leading-tight", large ? "text-[32px]" : "text-[27px]")}>{title}</h1>
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

function V3TabLink({ href, on, label, icon }: { href: string; on: boolean; label: string; icon: string }) {
  return (
    <Link
      href={href}
      aria-current={on ? "page" : undefined}
      className={cx(
        "flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-4 text-[16px] font-medium text-muted hover:text-ink",
        on && "bg-accent-soft font-semibold text-accent-ink",
      )}
    >
      <span className="text-base leading-none" aria-hidden>
        {icon}
      </span>
      {label}
    </Link>
  );
}
