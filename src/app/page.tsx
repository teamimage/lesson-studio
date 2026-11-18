import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";

// Retired with the older app versions (Nov 2026). Old links open the version 3
// page; the proxy normally does this before the page loads.
export default function Page() {
  return (
    <Suspense>
      <Go />
    </Suspense>
  );
}

async function Go() {
  await connection();
  return redirect("/v3");
}
