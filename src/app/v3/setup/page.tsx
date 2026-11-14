import Link from "next/link";
import { Suspense } from "react";
import { Shell } from "@/components/shell";
import { Me } from "@/components/v3/me";
import { Fold } from "@/components/fold";
import { SettingsBody } from "@/components/settings-body";
import { AdminBody } from "@/components/admin-body";
import { isAdmin } from "@/lib/admin";

type SP = Promise<{ saved?: string; password?: string; deleted?: string; error?: string; open?: string }>;

// Version 3: Settings and Admin folded into one Setup page, opened from the
// teacher's name in the header. Frees a tab slot.
export default function V3Setup({ searchParams }: { searchParams: SP }) {
  return (
    <Shell title="Setup" v3Tab="setup" me={<Me />}>
      <Suspense fallback={<div className="h-40 animate-pulse rounded-2xl bg-sheet" />}>
        <Body searchParams={searchParams} />
      </Suspense>
    </Shell>
  );
}

async function Body({ searchParams }: { searchParams: SP }) {
  const [admin, sp] = await Promise.all([isAdmin(), searchParams]);
  const adminNotice = !!(sp.deleted || sp.error || (sp.saved && sp.open === "admin"));
  return (
    <div className="flex flex-col gap-4">
      <Fold title="You and your studio" meta="name, AI costs, password, sign out" open={!adminNotice}>
        <SettingsBody searchParams={searchParams} adminLink={false} />
      </Fold>
      {admin && (
        <Fold title="Admin" meta="all teachers, students and storage" open={adminNotice || sp.open === "admin"}>
          <AdminBody searchParams={searchParams} />
        </Fold>
      )}
      <Link href="/craft" className="flex min-h-12 items-center gap-3 rounded-2xl border border-rule bg-sheet/60 px-4 py-2 text-ink no-underline">
        <span className="font-display text-[19px] font-semibold">Craft</span>
        <span className="text-sm text-muted">programs and reading for your own teaching</span>
        <span aria-hidden className="ml-auto text-xl text-muted">›</span>
      </Link>
      <p className="px-1 text-sm text-muted">
        Students are added and edited from the{" "}
        <Link href="/v3/students" className="text-accent-ink underline">
          Students
        </Link>{" "}
        tab.
      </p>
    </div>
  );
}
