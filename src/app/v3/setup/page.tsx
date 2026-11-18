import Link from "next/link";
import { Suspense } from "react";
import { Shell } from "@/components/shell";
import { Me } from "@/components/v3/me";
import { SettingsBody } from "@/components/settings-body";

type SP = Promise<{ saved?: string; password?: string; assistant?: string }>;

// Version 3: the teacher's own settings, opened from the teacher's name in
// the header. Running the app as a whole (all accounts, storage, AI costs)
// lives on the Admin tab, for app admins only.
export default function V3Setup({ searchParams }: { searchParams: SP }) {
  return (
    <Shell title="Settings" v3Tab="setup" me={<Me />}>
      <Suspense fallback={<div className="h-40 animate-pulse rounded-2xl bg-sheet" />}>
        <Body searchParams={searchParams} />
      </Suspense>
    </Shell>
  );
}

function Body({ searchParams }: { searchParams: SP }) {
  return (
    <div className="flex flex-col gap-4">
      <SettingsBody searchParams={searchParams} adminLink={false} />
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
