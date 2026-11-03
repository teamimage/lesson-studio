import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Shell } from "@/components/shell";
import { Me } from "@/components/v3/me";
import { Avatar } from "@/components/avatar";
import { Card, EmptyState } from "@/components/ui";
import { getViewer } from "@/lib/auth";
import { studentPhotoSrc } from "@/lib/constants";
import { listStudents } from "@/lib/data";

// Version 3 Family mode: pick a child (skipped when there is only one).
export default function V3Family() {
  return (
    <Shell title="Who's practising?" v3Tab="family" me={<Me />} large>
      <Suspense fallback={<div className="h-40 animate-pulse rounded-2xl bg-sheet" />}>
        <Body />
      </Suspense>
    </Shell>
  );
}

async function Body() {
  await getViewer();
  const students = (await listStudents()).filter((s) => s.active);
  if (students.length === 1) redirect(`/v3/family/${students[0].id}`);
  if (students.length === 0) return <EmptyState title="No students yet">Add a student first.</EmptyState>;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {students.map((s) => (
        <Link key={s.id} href={`/v3/family/${s.id}`} className="block">
          <Card tone="plum" className="flex items-center gap-4 py-5">
            <Avatar name={s.name} instrument={s.instrument} photoSrc={studentPhotoSrc(s)} size="lg" />
            <span className="text-[24px] font-semibold">{s.name.split(" ")[0]}</span>
          </Card>
        </Link>
      ))}
    </div>
  );
}
