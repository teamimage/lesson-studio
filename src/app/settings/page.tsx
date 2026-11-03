import { Suspense } from "react";
import { Shell } from "@/components/shell";
import { SettingsBody, type SettingsSP } from "@/components/settings-body";

export default function SettingsPage({ searchParams }: { searchParams: SettingsSP }) {
  return (
    <Shell title="Settings" tab="settings">
      <Suspense>
        <SettingsBody searchParams={searchParams} />
      </Suspense>
    </Shell>
  );
}
