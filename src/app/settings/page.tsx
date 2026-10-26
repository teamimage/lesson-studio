import { Suspense } from "react";
import { Shell } from "@/components/shell";
import { Button, Card, Field, Input, Notice, SectionTitle } from "@/components/ui";
import { getViewer } from "@/lib/auth";
import { signOut } from "@/app/login/actions";
import { updateTeacher } from "./actions";

type SP = Promise<{ saved?: string }>;

export default function SettingsPage({ searchParams }: { searchParams: SP }) {
  return (
    <Shell title="Settings" tab="settings">
      <Suspense>
        <Body searchParams={searchParams} />
      </Suspense>
    </Shell>
  );
}

async function Body({ searchParams }: { searchParams: SP }) {
  const viewer = await getViewer();
  const { saved } = await searchParams;
  return (
    <div className="flex flex-col gap-8">
      {saved && <Notice tone="sage">Saved.</Notice>}
      {viewer.teacher && (
        <section>
          <SectionTitle>Teacher</SectionTitle>
          <form action={updateTeacher} className="flex flex-col gap-4">
            <Field label="Your name" hint="Appears on lesson sheets, e.g. “Ms. Ana”.">
              <Input name="name" defaultValue={viewer.teacher.name} />
            </Field>
            <Field label="Studio name">
              <Input name="studio_name" defaultValue={viewer.teacher.studio_name} placeholder="Home Studio" />
            </Field>
            <Button>Save</Button>
          </form>
        </section>
      )}

      <section>
        <SectionTitle>Account</SectionTitle>
        <Card className="flex flex-col gap-3">
          <div className="text-[15px]">
            Signed in as <span className="font-medium">{viewer.email}</span>
            <div className="text-sm text-muted">
              {viewer.teacher ? "Teacher" : ""}
              {viewer.teacher && viewer.parentRows.length > 0 ? " and " : ""}
              {viewer.parentRows.length > 0 ? "parent" : ""}
            </div>
          </div>
          <form action={signOut}>
            <Button variant="secondary">Sign out</Button>
          </form>
        </Card>
      </section>
    </div>
  );
}
