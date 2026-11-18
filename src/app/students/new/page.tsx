import { Suspense } from "react";
import { Shell } from "@/components/shell";
import { StudentForm } from "@/components/student-form";
import { Notice } from "@/components/ui";
import { requireTeacher } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createStudent } from "../actions";

type SP = Promise<{ error?: string }>;

export default function NewStudentPage({ searchParams }: { searchParams: SP }) {
  return (
    <Shell title="New student" eyebrow="Students" back={{ href: "/", label: "Studio" }} tab="studio">
      <Suspense>
        <Body searchParams={searchParams} />
      </Suspense>
    </Shell>
  );
}

async function Body({ searchParams }: { searchParams: SP }) {
  await requireTeacher();
  const { error } = await searchParams;
  // The usual lesson length field appears once student-lesson-length.sql has run.
  const { error: noLength } = await (await createClient()).from("students").select("lesson_minutes").limit(1);
  return (
    <div className="flex flex-col gap-4">
      {error && <Notice tone="danger">Something went wrong saving. Try again.</Notice>}
      <StudentForm action={createStudent} submitLabel="Add student" withParent lengthReady={!noLength} />
    </div>
  );
}
