import { Suspense } from "react";
import { Shell } from "@/components/shell";
import { AdminBody, type AdminSP } from "@/components/admin-body";

export default function AdminPage({ searchParams }: { searchParams: AdminSP }) {
  return (
    <Shell v3Tab="admin" title="Admin" eyebrow="Running the app" wide>
      <Suspense>
        <AdminBody searchParams={searchParams} />
      </Suspense>
    </Shell>
  );
}
