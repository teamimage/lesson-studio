"use client";

import { useSyncExternalStore } from "react";

const noop = () => () => {};

// A date and time in the viewer's own time zone (the server runs on UTC), so
// it renders empty on the server and fills in on the device.
export function LocalDateTime({ iso, className }: { iso: string; className?: string }) {
  const label = useSyncExternalStore(
    noop,
    () =>
      new Date(iso).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }),
    () => "",
  );
  return <span className={className}>{label}</span>;
}
