import { Suspense } from "react";
import { Shell } from "@/components/shell";
import { AdminBody, type AdminSP } from "@/components/admin-body";

export default function AdminPage({ searchParams }: { searchParams: AdminSP }) {
  return (
    <Shell title="Admin" eyebrow="All accounts" back={{ href: "/settings", label: "Settings" }} wide>
      <Suspense>
        <AdminBody searchParams={searchParams} />
      </Suspense>
    </Shell>
  );
}
