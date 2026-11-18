import { Suspense } from "react";
import { redirect } from "next/navigation";

// Retired with the older app versions (Nov 2026). Old links open the version 3
// page; the proxy normally does this before the page loads.
export default function Page({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense>
      <Go params={params} />
    </Suspense>
  );
}

async function Go({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return redirect(`/v3/students/${id}`);
}
