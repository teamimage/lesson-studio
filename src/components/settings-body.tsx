import { listStudents } from "@/lib/data";
import { PracticePinSetting } from "@/components/practice-pin-setting";
import { practicePinSet } from "@/lib/practice-pin";
import { Button, Card, Field, Input, Notice, SectionTitle } from "@/components/ui";
import { PasswordInput } from "@/components/password-input";
import { getViewer } from "@/lib/auth";
import { isAdmin } from "@/lib/admin";
import Link from "next/link";
import { Fold } from "@/components/fold";
import { signOut } from "@/app/login/actions";
import { setPassword, updateReviewTone, updateTeacher } from "@/app/settings/actions";
import { updateMessageSettings } from "@/app/students/overview-actions";
import { STANDARD_LABELS, SYSTEM_LABELS, parseGrading } from "@/lib/grading";
import {
  PROFILE_SECTIONS,
  QUESTIONS,
  REVIEW_TONES,
  TONE_LABELS,
  answeredCount,
  levelProgress,
  parseProfile,
  toneOf,
} from "@/lib/assistant/profile";
import type { Json, Tables } from "@/lib/supabase/types";

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

/**
 * The Settings page body (also the version 3 Settings page): the teacher's
 * own studio, each part a box that opens in place. Teaching assistant and
 * grading have their own page (Teacher settings and grading); running the
 * app as a whole lives on the Admin tab.
 */
export async function SettingsBody({ searchParams, adminLink = true }: { searchParams: SettingsSP; adminLink?: boolean }) {
  const viewer = await getViewer();
  const { saved, password } = await searchParams;
  const admin = adminLink ? await isAdmin() : false;
  const passwordNotice = password ? PASSWORD_NOTICES[password] : undefined;
  return (
    <div className="flex flex-col gap-3">
      {admin && (
        <Link
          href="/admin"
          className="flex min-h-12 items-center justify-between rounded-2xl border border-accent/30 bg-accent-soft px-4 font-semibold text-accent-ink"
        >
          Admin: all teachers and students
          <span aria-hidden>›</span>
        </Link>
      )}
      {viewer.teacher && (
        <Fold id="studio" title="You and your studio" meta="names" open={!!saved}>
          {saved && <Notice tone="sage">Saved.</Notice>}
          <form action={updateTeacher} className="flex flex-col gap-4">
            <Field label="Your name" hint="Appears on lesson sheets, e.g. “Ms. Ana”.">
              <Input name="name" defaultValue={viewer.teacher.name} />
            </Field>
            <Field label="Studio name">
              <Input name="studio_name" defaultValue={viewer.teacher.studio_name} placeholder="Home Studio" />
            </Field>
            <Button>Save</Button>
          </form>
        </Fold>
      )}

      {viewer.teacher && (
        <RowLink href="/settings/lesson-times" title="Lesson times" hint="Each student's regular weekly lesson, and one-off lessons" />
      )}

      {viewer.teacher && (
        <RowLink href="/families" title="Families" hint="Parents and guardians, what they see, and their invites" />
      )}

      {viewer.teacher && (
        <Fold id="messages" title="Messages" meta="signature, reply address">
          <MessageSettings teacher={viewer.teacher} />
        </Fold>
      )}

      {viewer.teacher && (
        <RowLink href="/settings/teaching" title="Teacher settings and grading" hint="Your teaching assistant, review tone and grading" />
      )}

      {viewer.teacher && (
        <RowLink href="/store" title="Studio store" hint="Books, supplies and gear for your families to buy" />
      )}

      {!viewer.teacher && viewer.parentRows.length > 0 && <ParentPins />}

      <Fold id="account" title="Account" meta={viewer.email}>
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
      </Fold>

      <Fold id="password" title="Password" meta="sign in without a code" open={!!passwordNotice}>
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
      </Fold>
    </div>
  );
}

/** Teacher settings and grading page: teaching assistant and grading. */
export async function TeachingSettingsBody({ searchParams }: { searchParams: Promise<{ assistant?: string }> }) {
  const viewer = await getViewer();
  const { assistant } = await searchParams;
  if (!viewer.teacher) return null;
  return (
    <div className="flex flex-col gap-8">
      <TeachingAssistant teacher={viewer.teacher} notice={assistant} />
      <Grading teacher={viewer.teacher} />
    </div>
  );
}

function RowLink({ href, title, hint }: { href: string; title: string; hint: string }) {
  return (
    <Link
      href={href}
      className="flex min-h-12 items-center gap-3 rounded-2xl border border-rule bg-sheet/60 px-4 py-2 text-ink no-underline"
    >
      <span className="min-w-0">
        <span className="block font-display text-[19px] font-semibold">{title}</span>
        <span className="block text-sm text-muted">{hint}</span>
      </span>
      <span aria-hidden className="ml-auto text-xl text-muted">
        ›
      </span>
    </Link>
  );
}

// Which grading system and standard practice reviews use.
function Grading({ teacher }: { teacher: Tables<"teachers"> }) {
  const g = parseGrading((teacher as { grading?: unknown }).grading);
  return (
    <section id="grading" className="scroll-mt-6">
      <SectionTitle>Grading</SectionTitle>
      <Link
        href="/settings/grading"
        className="flex min-h-12 items-center justify-between rounded-2xl border border-rule bg-sheet px-4 py-3 font-semibold"
      >
        <span>
          {SYSTEM_LABELS[g.system].label}
          {g.system !== "none" && `, ${STANDARD_LABELS[g.standard].label.toLowerCase()} standard`}
          <span className="block text-sm font-normal text-muted">
            Choose the system, how strict it is, what each grade means, and set any student apart.
          </span>
        </span>
        <span aria-hidden>›</span>
      </Link>
    </section>
  );
}

// The teacher's own teaching assistant: review tone, and a way into the chat
// that builds their teaching profile.
function TeachingAssistant({ teacher, notice }: { teacher: Tables<"teachers">; notice?: string }) {
  const tone = toneOf(teacher.review_tone);
  const profile = parseProfile(teacher.teaching_profile as Json | null | undefined);
  const filled = PROFILE_SECTIONS.filter((s) => profile.sections[s.id]).length;
  const answered = answeredCount(profile);
  const progress = levelProgress(profile);
  const basics = progress[0];
  const setsDone = progress.slice(1).filter((l) => l.complete).length;
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
                ? `${basics.total} basic questions, about 15 minutes; more sets on topics you choose later`
                : !basics.complete
                  ? `Basics ${basics.done} of ${basics.total} · ${filled} profile sections`
                  : `Basics done · ${setsDone} of ${progress.length - 1} more sets · ${answered} of ${QUESTIONS.length} questions`}
            </span>
          </span>
          <span aria-hidden>›</span>
        </Link>
      </Card>
    </section>
  );
}

// Family accounts: a parent PIN per child that guards changing practice records.
async function ParentPins() {
  const students = (await listStudents()).filter((s) => s.active);
  if (!students.length) return null;
  const pins = await Promise.all(students.map((s) => practicePinSet(s.id)));
  return (
    <Fold id="practice-records" title="Practice records" meta="parent PIN" open>
        <p className="text-sm text-muted">
          Set a PIN so only a parent can change a day&apos;s practice record (tick off work, fix the minutes). Practising and
          ticking off today&apos;s list still works without it.
        </p>
        {students.map((s, i) => (
          <PracticePinSetting
            key={s.id}
            studentId={s.id}
            name={students.length > 1 ? s.name.split(" ")[0] : undefined}
            isSet={pins[i]}
          />
        ))}
    </Fold>
  );
}

/** Settings, Messages box: how emails and texts from the Contact buttons go out. */
function MessageSettings({ teacher }: { teacher: Tables<"teachers"> }) {
  const t = teacher as Tables<"teachers"> & { message_signature?: string | null; message_reply_to?: string | null };
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted">
        Emails and texts sent from a student&apos;s Contact buttons go out from the app and are kept in that student&apos;s communication history.
      </p>
      {t.message_signature === undefined ? (
        <Notice tone="amber">Run student-overview.sql in Supabase to set a signature and reply address.</Notice>
      ) : (
        <form action={updateMessageSettings} className="flex flex-col gap-4">
          <Field label="Sign messages as" hint="Added to the end of every email and text, e.g. “Maaike Kahn, Kahn Music Studio”.">
            <Input name="message_signature" defaultValue={t.message_signature ?? ""} />
          </Field>
          <Field label="Replies go to" hint="The email address families reply to. Empty uses your sign-in email.">
            <Input name="message_reply_to" type="email" defaultValue={t.message_reply_to ?? ""} />
          </Field>
          <Button>Save</Button>
        </form>
      )}
    </div>
  );
}
