import { Suspense } from "react";
import { Shell } from "@/components/shell";
import { AssistantChat } from "@/components/assistant-chat";
import { Button, Card, Field, Notice, SectionTitle, Textarea } from "@/components/ui";
import { updateTeachingProfile } from "@/app/settings/actions";
import { requireTeacher } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  PROFILE_SECTIONS,
  QUESTIONS,
  SECTION_MAX_CHARS,
  TONE_LABELS,
  answeredCount,
  basicsDone,
  levelProgress,
  parseProfile,
  toneOf,
} from "@/lib/assistant/profile";
import type { Json } from "@/lib/supabase/types";

type SP = Promise<{ profile?: string }>;

export default function AssistantPage({ searchParams }: { searchParams: SP }) {
  return (
    <Suspense fallback={<Shell title="Teaching assistant" tab="settings">{null}</Shell>}>
      <Body searchParams={searchParams} />
    </Suspense>
  );
}

async function Body({ searchParams }: { searchParams: SP }) {
  const { teacher } = await requireTeacher();
  const { profile: notice } = await searchParams;
  const db = await createClient();
  const { data: rows, error } = await db
    .from("teaching_assistant_messages")
    .select("id, role, content")
    .eq("teacher_id", teacher.id)
    .order("created_at", { ascending: true })
    .limit(200);
  const profile = parseProfile(teacher.teaching_profile as Json | null | undefined);
  const tone = toneOf(teacher.review_tone);
  const answered = answeredCount(profile);
  const progress = levelProgress(profile);
  const basics = progress[0];
  const sets = progress.slice(1);
  const current = sets.find((l) => l.id === profile.level && !l.complete)?.id;

  return (
    <Shell title="Teaching assistant" back={{ href: "/settings#assistant", label: "Settings" }} tab="settings">
      <div className="flex flex-col gap-8">
        {error ? (
          <Notice tone="danger">
            The teaching assistant isn&apos;t set up in Supabase yet. Run teaching-assistant.sql in the Supabase SQL Editor, then
            reload this page.
          </Notice>
        ) : (
          <section>
            <p className="mb-3 text-sm text-muted">
              Answer in your own words, typed or dictated. Your answers become your teaching profile below, which every
              practice review, grade and lesson draft follows. Everyone starts with {basics.total} basic questions (
              {basics.done} done); after that, pick any of the other sets whenever you like. {answered} of {QUESTIONS.length}{" "}
              questions covered in all. Reviews are set to <span className="font-medium text-ink">{TONE_LABELS[tone].label}</span>; you can change that
              here or in Settings.
            </p>
            <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {progress.map((l) => (
                <li key={l.id} className={l.complete ? "text-sage" : l.done ? "text-ink" : "text-muted"}>
                  {l.complete ? "✓ " : ""}
                  {l.title} {l.done}/{l.total}
                </li>
              ))}
            </ul>
            <AssistantChat
              sets={sets}
              basicsDone={basicsDone(profile)}
              current={current}
              initial={(rows ?? []).map((r) => ({ id: r.id, role: r.role === "user" ? "user" : "assistant", content: r.content }))}
            />
          </section>
        )}

        <section id="profile" className="scroll-mt-6">
          <SectionTitle>Your teaching profile</SectionTitle>
          {notice === "saved" && <Notice tone="sage">Profile saved.</Notice>}
          {notice === "setup" && <Notice tone="danger">Run teaching-assistant.sql in the Supabase SQL Editor first.</Notice>}
          <Card className="mt-2 flex flex-col gap-4">
            <p className="text-sm text-muted">
              The assistant keeps this up to date as you talk. Edit anything directly; empty sections are left out.
            </p>
            <form action={updateTeachingProfile} className="flex flex-col gap-4">
              {PROFILE_SECTIONS.map((s) => (
                <Field key={s.id} label={s.label}>
                  <Textarea
                    name={`section_${s.id}`}
                    defaultValue={profile.sections[s.id] ?? ""}
                    maxLength={SECTION_MAX_CHARS}
                    rows={profile.sections[s.id] ? 4 : 2}
                  />
                </Field>
              ))}
              <Button>Save profile</Button>
            </form>
          </Card>
        </section>
      </div>
    </Shell>
  );
}
