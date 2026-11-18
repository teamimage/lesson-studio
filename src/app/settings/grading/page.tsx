import { Suspense } from "react";
import { Shell } from "@/components/shell";
import { GradingSettings } from "@/components/grading-settings";
import { requireTeacher } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { parseGrading } from "@/lib/grading";

type SP = Promise<{ saved?: string }>;

export default function GradingPage({ searchParams }: { searchParams: SP }) {
  return (
    <Suspense fallback={<Shell title="Grading" tab="settings">{null}</Shell>}>
      <Body searchParams={searchParams} />
    </Suspense>
  );
}

async function Body({ searchParams }: { searchParams: SP }) {
  const { teacher } = await requireTeacher();
  const { saved } = await searchParams;
  const db = await createClient();
  const studio = parseGrading((teacher as { grading?: unknown }).grading);
  const { data: students } = await db.from("students").select("*").eq("teacher_id", teacher.id).order("name");
  return (
    <Shell title="Grading" back={{ href: "/settings/teaching#grading", label: "Teacher settings" }} tab="settings">
      <GradingSettings studio={studio} students={students ?? []} saved={saved} />
    </Shell>
  );
}
