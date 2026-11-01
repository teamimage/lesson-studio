"use client";

import { useSyncExternalStore } from "react";

const noop = () => () => {};
const today = () => new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

// Today's date in the viewer's own time zone (the server runs on UTC), so it
// renders empty on the server and fills in on the device.
export function TodayDate({ className }: { className?: string }) {
  const label = useSyncExternalStore(noop, today, () => "");
  return <span className={className}>{label}</span>;
}
