import { Button, Card, Field, Input, Notice, SectionTitle } from "@/components/ui";
import { PasswordInput } from "@/components/password-input";
import { getViewer } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";
import Link from "next/link";
import { signOut } from "@/app/login/actions";
import { setPassword, updateReviewTone, updateTeacher } from "@/app/settings/actions";
import { PROFILE_SECTIONS, QUESTIONS, REVIEW_TONES, TONE_LABELS, parseProfile, toneOf } from "@/lib/assistant/profile";
import type { Json, Tables } from "@/lib/supabase/types";
import { getUsageSummary } from "@/lib/ai/usage";
import { formatUsd } from "@/lib/ai/pricing";
import { formatDate } from "@/lib/format";

const PASSWORD_NOTICES: Record<string, { tone: "sage" | "danger" | "plum"; text: string }> = {
  saved: { tone: "sage", text: "Password saved. Next time, sign in with your email and this password." },
  reset: { tone: "plum", text: "You're signed in. Choose a new password below." },
  short: { tone: "danger", text: "Use at least 8 characters." },
  mismatch: { tone: "danger", text: "The two passwords don't match." },
  same: { tone: "danger", text: "That's already your password. Choose a different one." },
  weak: { tone: "danger", text: "That password is too easy to guess. Try a longer one." },
  failed: { tone: "danger", text: "We couldn't save the password. Sign out and back in, then try again." },
};

export type SettingsSP = Promise<{ saved?: string; password?: string; assistant?: string }>;

/** The Settings page body; also folded into the version 3 Setup page. */
export async function SettingsBody({ searchParams, adminLink = true }: { searchParams: SettingsSP; adminLink?: boolean }) {
  const viewer = await getViewer();
  const { saved, password, assistant } = await searchParams;
  const admin = await isAdmin();
  const passwordNotice = password ? PASSWORD_NOTICES[password] : undefined;
  return (
    <div className="flex flex-col gap-8">
      {saved && <Notice tone="sage">Saved.</Notice>}
      {admin && adminLink && (
        <Link
          href="/admin"
          className="flex min-h-12 items-center justify-between rounded-2xl border border-accent/30 bg-accent-soft px-4 font-semibold text-accent-ink"
        >
          Admin: all teachers and students
          <span aria-hidden>›</span>
        </Link>
      )}
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

      {viewer.teacher && <TeachingAssistant teacher={viewer.teacher} notice={assistant} />}

      {viewer.teacher && <AiCosts teacherId={viewer.teacher.id} />}

      <section>
        <SectionTitle>Account</SectionTitle>
        <Card className="flex flex-col gap-3">
          <div className="text-[16px]">
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

      <section id="password" className="scroll-mt-6">
        <SectionTitle>Password</SectionTitle>
        <Card className="flex flex-col gap-3">
          <p className="text-sm text-muted">
            Set a password to sign in without waiting for an email code. You can still use a code any time.
          </p>
          {passwordNotice && <Notice tone={passwordNotice.tone}>{passwordNotice.text}</Notice>}
          <form action={setPassword} className="flex flex-col gap-4">
            {/* Lets password managers save the login under the right email. */}
            <input type="email" name="username" autoComplete="username" value={viewer.email} readOnly hidden />
            <Field label="New password" hint="At least 8 characters.">
              <PasswordInput
                name="password"
                autoComplete="new-password"
                minLength={8}
                required
                autoFocus={password === "reset"}
              />
            </Field>
            <Field label="Type it again">
              <PasswordInput name="confirm" autoComplete="new-password" minLength={8} required />
            </Field>
            <Button>Save password</Button>
          </form>
        </Card>
      </section>
    </div>
  );
}

function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

// Running totals of what the AI has cost: lesson videos (transcription +
// Claude) and reading uploaded sheet music.
async function AiCosts({ teacherId }: { teacherId: string }) {
  const usage = await getUsageSummary(teacherId);
  return (
    <section id="ai-costs" className="scroll-mt-6">
      <SectionTitle>AI costs</SectionTitle>
      <Card className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-[12px] font-semibold uppercase tracking-[0.12em] text-muted">This month</div>
            <div className="font-display text-2xl">{formatUsd(usage.thisMonthUsd)}</div>
          </div>
          <div>
            <div className="text-[12px] font-semibold uppercase tracking-[0.12em] text-muted">All time</div>
            <div className="font-display text-2xl">{formatUsd(usage.allTimeUsd)}</div>
          </div>
        </div>
        {usage.lessons.length === 0 ? (
          <p className="text-sm text-muted">
            Nothing yet. Costs show up here after a lesson video is processed, sheet music is read or a practice session is reviewed.
          </p>
        ) : (
          <>
            <div>
              <div className="mb-1 text-sm font-semibold">By month</div>
              <ul className="divide-y divide-rule text-sm">
                {usage.months.map((m) => (
                  <li key={m.month} className="flex justify-between py-1.5">
                    <span>{monthLabel(m.month)}</span>
                    <span className="tabular-nums">{formatUsd(m.costUsd)}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="mb-1 text-sm font-semibold">By lesson, music and practice</div>
              <ul className="divide-y divide-rule text-sm">
                {usage.lessons.slice(0, 30).map((l) => (
                  <li
                    key={l.key}
                    className="flex items-baseline justify-between gap-3 py-1.5"
                  >
                    <span className="min-w-0">
                      {l.assistant ? (
                        <span className="font-medium">Teaching assistant</span>
                      ) : l.practice ? (
                        <span className="font-medium">
                          Practice reviews{l.studentName ? `: ${l.studentName}` : " (deleted sessions)"}
                        </span>
                      ) : l.music ? (
                        l.scoreTitle ? (
                          <span className="font-medium">
                            Sheet music: {l.scoreTitle}
                            {l.studentName ? ` (${l.studentName})` : ""}
                          </span>
                        ) : (
                          <span className="text-muted">Deleted sheet music</span>
                        )
                      ) : l.lessonId ? (
                        <Link href={`/lessons/${l.lessonId}`} className="font-medium text-accent-ink">
                          {l.studentName ?? "Lesson"}
                          {l.lessonDate ? `, ${formatDate(l.lessonDate)}` : ""}
                        </Link>
                      ) : (
                        <span className="text-muted">Deleted lessons</span>
                      )}
                      <span className="block text-xs text-muted">
                        {l.audioMinutes > 0 ? `${Math.round(l.audioMinutes)} min transcribed ${formatUsd(l.transcriptionUsd)} · ` : ""}
                        Claude {formatUsd(l.claudeUsd)}
                      </span>
                    </span>
                    <span className="tabular-nums">{formatUsd(l.costUsd)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </Card>
    </section>
  );
}

// The teacher's own teaching assistant: review tone, and a way into the chat
// that builds their teaching profile.
function TeachingAssistant({ teacher, notice }: { teacher: Tables<"teachers">; notice?: string }) {
  const tone = toneOf(teacher.review_tone);
  const profile = parseProfile(teacher.teaching_profile as Json | null | undefined);
  const filled = PROFILE_SECTIONS.filter((s) => profile.sections[s.id]).length;
  const answered = QUESTIONS.filter((q) => profile.answered.includes(q.id)).length;
  return (
    <section id="assistant" className="scroll-mt-6">
      <SectionTitle>Your teaching assistant</SectionTitle>
      <Card className="flex flex-col gap-4">
        <p className="text-sm text-muted">
          Bring your teaching style. Your assistant interviews you about how you teach and what good practice looks like
          to you, and every practice review, grade and lesson draft then follows your standards and your words.
        </p>
        {notice === "saved" && <Notice tone="sage">Review tone saved.</Notice>}
        {notice === "setup" && (
          <Notice tone="danger">Run teaching-assistant.sql in the Supabase SQL Editor first, then save again.</Notice>
        )}
        <form action={updateReviewTone} className="flex flex-col gap-2">
          <div className="text-sm font-semibold">How strict should reviews be?</div>
          {REVIEW_TONES.map((t) => (
            <label key={t} className="flex items-start gap-2.5 rounded-xl border border-rule px-3 py-2">
              <input type="radio" name="review_tone" value={t} defaultChecked={tone === t} className="mt-1.5" />
              <span>
                <span className="font-medium">{TONE_LABELS[t].label}</span>
                <span className="block text-sm text-muted">{TONE_LABELS[t].hint}</span>
              </span>
            </label>
          ))}
          <Button variant="secondary">Save review tone</Button>
        </form>
        <Link
          href="/settings/assistant"
          className="flex min-h-12 items-center justify-between rounded-2xl border border-accent/30 bg-accent-soft px-4 font-semibold text-accent-ink"
        >
          <span>
            {answered === 0 ? "Start the interview" : "Talk to your assistant"}
            <span className="block text-sm font-normal text-muted">
              {answered === 0
                ? "About 20 minutes, in as many sittings as you like"
                : `${answered} of ${QUESTIONS.length} questions covered · ${filled} profile sections`}
            </span>
          </span>
          <span aria-hidden>›</span>
        </Link>
      </Card>
    </section>
  );
}
