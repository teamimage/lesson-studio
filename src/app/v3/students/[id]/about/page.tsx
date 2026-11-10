import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Shell } from "@/components/shell";
import { Me } from "@/components/v3/me";
import { Avatar } from "@/components/avatar";
import { InstrumentTag } from "@/components/instrument-tag";
import { FamilyAccess } from "@/components/family-access";
import { LocalDateTime } from "@/components/local-time";
import { Card, Notice, Pill } from "@/components/ui";
import { requireTeacher } from "@/lib/auth";
import { studentPhotoSrc } from "@/lib/constants";
import { getStudent, listParentsForStudent, listRepertoire } from "@/lib/data";
import { capitalize, daysBetween, formatDate, todayISO } from "@/lib/format";
import { getConsentStatus } from "@/lib/recording-consent-data";
import { consentPath } from "@/lib/recording-consent";
import { createClient } from "@/lib/supabase/server";

type Params = Promise<{ id: string }>;
type SP = Promise<{ invite?: string; made?: string }>;

// Version 3: the student's name on their page opens this one. Everything
// about the student and their family that isn't day-to-day teaching: details,
// how long they've been with you and how far they've come, recording consent,
// and family sign-in with the "Invite family" portal invite.
export default function V3StudentAboutPage({ params, searchParams }: { params: Params; searchParams: SP }) {
  return (
    <Suspense fallback={<Shell title=" " v3Tab="students" me={<Me />} wide>{null}</Shell>}>
      <Body params={params} searchParams={searchParams} />
    </Suspense>
  );
}

const STATUS_ORDER = ["performed", "review", "polishing", "learning", "preview"] as const;
const STATUS_LABEL: Record<string, string> = {
  performed: "performed",
  review: "learned, on review",
  polishing: "polishing",
  learning: "learning",
  preview: "previewing",
};

async function Body({ params, searchParams }: { params: Params; searchParams: SP }) {
  const { teacher } = await requireTeacher();
  const { id } = await params;
  const sp = await searchParams;
  const student = await getStudent(id);
  if (!student) notFound();
  const supabase = await createClient();
  const [parents, consent, repertoire, lessonRows, logRows] = await Promise.all([
    listParentsForStudent(id),
    getConsentStatus(id),
    listRepertoire(id),
    supabase.from("lessons").select("lesson_date").eq("student_id", id).order("lesson_date", { ascending: true }),
    supabase.from("practice_logs").select("practice_date, minutes").eq("student_id", id),
  ]);
  const first = student.name.split(" ")[0];
  const lessonDates = (lessonRows.data ?? []).map((l) => l.lesson_date);
  const logs = logRows.data ?? [];
  const today = todayISO();
  const since = [student.created_at.slice(0, 10), lessonDates[0]].filter(Boolean).sort()[0] as string;
  const practisedDays = logs.filter((l) => (l.minutes ?? 0) > 0).length;
  const practiceMinutes = logs.reduce((n, l) => n + (l.minutes ?? 0), 0);
  const byStatus = new Map<string, number>();
  for (const r of repertoire) byStatus.set(r.status, (byStatus.get(r.status) ?? 0) + 1);
  const finished = (byStatus.get("performed") ?? 0) + (byStatus.get("review") ?? 0);
  const current = repertoire.filter((r) => r.status === "learning" || r.status === "polishing");
  const back = `/v3/students/${id}`;

  return (
    <Shell
      title={
        <span className="flex items-center gap-3">
          <Avatar
            name={student.name}
            instrument={student.instrument}
            photoSrc={studentPhotoSrc(student)}
            size="lg"
            editStudentId={student.id}
          />
          <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            {student.name}
            <InstrumentTag instrument={student.instrument} />
          </span>
        </span>
      }
      eyebrow="Student & family"
      back={{ href: back, label: first }}
      v3Tab="students"
      me={<Me />}
      wide
      actions={
        <Link href={`/students/${id}/edit`} className="text-sm font-medium text-accent-ink">
          Edit
        </Link>
      }
    >
      <div className="grid items-start gap-5 lg:grid-cols-2">
        <div className="flex flex-col gap-5">
          <Card className="flex flex-col gap-3 text-[16px]">
            <h2 className="font-display text-[20px] font-semibold">Student</h2>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
              <dt className="text-muted">Instrument</dt>
              <dd>{capitalize(student.instrument)}</dd>
              {student.age != null && (
                <>
                  <dt className="text-muted">Age</dt>
                  <dd>{student.age}</dd>
                </>
              )}
              <dt className="text-muted">Method</dt>
              <dd>{capitalize(student.method)}</dd>
              {student.current_book && (
                <>
                  <dt className="text-muted">Book</dt>
                  <dd>{student.current_book}</dd>
                </>
              )}
              {student.lesson_day && (
                <>
                  <dt className="text-muted">Lessons</dt>
                  <dd>
                    {student.lesson_day}
                    {student.lesson_time ? ` at ${student.lesson_time}` : ""}
                  </dd>
                </>
              )}
              {student.goals && (
                <>
                  <dt className="text-muted">Goals</dt>
                  <dd>{student.goals}</dd>
                </>
              )}
              {student.notes && (
                <>
                  <dt className="text-muted">Private notes</dt>
                  <dd>{student.notes}</dd>
                </>
              )}
            </dl>
            <Link href={`/students/${id}/edit`} className="self-start text-sm text-accent-ink underline">
              Edit details
            </Link>
          </Card>

          <Card className="flex flex-col gap-3 text-[16px]">
            <h2 className="font-display text-[20px] font-semibold">How far {first} has come</h2>
            <p>
              With you since <span className="font-semibold">{formatDate(since, "long")}</span>
              <span className="text-muted"> ({spanLabel(daysBetween(since, today))})</span>.
            </p>
            <ul className="flex flex-col gap-1">
              <li>
                <span className="font-semibold tabular-nums">{lessonDates.length}</span> lesson
                {lessonDates.length === 1 ? "" : "s"} on record
                {lessonDates.length > 0 && (
                  <span className="text-muted">
                    , first on {formatDate(lessonDates[0])}, latest on {formatDate(lessonDates[lessonDates.length - 1])}
                  </span>
                )}
              </li>
              <li>
                <span className="font-semibold tabular-nums">{practisedDays}</span> practice day
                {practisedDays === 1 ? "" : "s"} logged
                {practiceMinutes > 0 && <span className="text-muted">, {formatHours(practiceMinutes)} in all</span>}
              </li>
              <li>
                <span className="font-semibold tabular-nums">{finished}</span> piece{finished === 1 ? "" : "s"} learned
                {repertoire.length > 0 && <span className="text-muted"> of {repertoire.length} on the repertoire map</span>}
              </li>
            </ul>
            {repertoire.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {STATUS_ORDER.filter((s) => byStatus.get(s)).map((s) => (
                  <Pill key={s} tone={s === "performed" || s === "review" ? "sage" : s === "preview" ? "muted" : "amber"}>
                    {byStatus.get(s)} {STATUS_LABEL[s]}
                  </Pill>
                ))}
              </div>
            )}
            {current.length > 0 && (
              <p className="text-sm">
                <span className="text-muted">Working on now: </span>
                {current.map((r) => r.title).join(", ")}
              </p>
            )}
          </Card>
        </div>

        <Card className="flex flex-col gap-4 text-[16px]">
          <h2 className="font-display text-[20px] font-semibold">Family</h2>
          <div className="flex flex-col gap-1.5">
            <div className="text-[12px] font-semibold uppercase tracking-[0.1em] text-accent-ink">Recording consent</div>
            {consent.state === "signed" ? (
              <p>
                ✓ Signed by {consent.consent.signerName}, <LocalDateTime iso={consent.consent.signedAt} />.
              </p>
            ) : (
              <Notice tone="danger">No recording consent on file. Lessons can&apos;t be recorded until a parent signs.</Notice>
            )}
            <Link href={consentPath(id, `/v3/students/${id}/about`)} className="self-start text-sm text-accent-ink underline">
              {consent.state === "signed" ? "View or withdraw" : "Collect consent"}
            </Link>
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="text-[12px] font-semibold uppercase tracking-[0.1em] text-accent-ink">Parents</div>
            {parents.length === 0 ? (
              <p className="text-sm text-muted">No parent linked yet. An invite below adds one when they sign in.</p>
            ) : (
              <ul className="flex flex-col gap-0.5">
                {parents.map((p) => (
                  <li key={p.id}>
                    {p.name} <span className="text-muted">· {p.email}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <FamilyAccess
            student={student}
            teacher={teacher}
            parents={parents}
            flash={sp.invite}
            made={sp.made}
            returnTo={`/v3/students/${id}/about`}
          />
          <Link href={`/v3/family/${id}`} className="self-start text-sm text-plum underline">
            See {first}&apos;s Family mode
          </Link>
        </Card>
      </div>
    </Shell>
  );
}

function spanLabel(days: number): string {
  if (days < 14) return `${days} day${days === 1 ? "" : "s"}`;
  if (days < 61) return `${Math.round(days / 7)} weeks`;
  const months = Math.round(days / 30.44);
  if (months < 24) return `${months} months`;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  return `${years} years${rest ? `, ${rest} month${rest === 1 ? "" : "s"}` : ""}`;
}

function formatHours(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h} hr${h === 1 ? "" : "s"}${m ? ` ${m} min` : ""}`;
}
