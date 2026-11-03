import { Suspense } from "react";
import { getViewer } from "@/lib/auth";

// Version 3: the teacher's first name in the header, which opens Setup.
export function Me() {
  return (
    <Suspense fallback="Setup">
      <Name />
    </Suspense>
  );
}

async function Name() {
  const viewer = await getViewer();
  return viewer.teacher?.name?.trim().split(/\s+/)[0] || "Setup";
}
