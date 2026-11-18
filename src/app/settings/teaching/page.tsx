import { Suspense } from "react";
import { Shell } from "@/components/shell";
import { TeachingSettingsBody } from "@/components/settings-body";

// Teacher settings and grading: the teaching assistant (review tone and the
// interview that builds the teaching profile) and the grading system. Opened
// from a link on Settings.
export default function TeachingSettingsPage({ searchParams }: { searchParams: Promise<{ assistant?: string }> }) {
  return (
    <Shell title="Teacher settings and grading" back={{ href: "/settings", label: "Settings" }} tab="settings" v3Tab="setup">
      <Suspense fallback={<div className="h-40 animate-pulse rounded-2xl bg-sheet" />}>
        <TeachingSettingsBody searchParams={searchParams} />
      </Suspense>
    </Shell>
  );
}
