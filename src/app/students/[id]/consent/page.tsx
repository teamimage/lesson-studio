import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Shell } from "@/components/shell";
import { Card, LinkButton, Notice, SectionTitle, Textarea } from "@/components/ui";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { ConsentForm } from "@/components/consent-form";
import { LocalDateTime } from "@/components/local-time";
import { getViewer } from "@/lib/auth";
import { getStudent, getTeacherForStudent } from "@/lib/data";
import { CONSENT_RELATIONSHIPS, CONSENT_SETUP_MESSAGE, CONSENT_VERSION, consentHeading, consentPoints } from "@/lib/recording-consent";
import { getConsentStatus, listConsents } from "@/lib/recording-consent-data";
import { withdrawConsent } from "@/app/students/consent-actions";

type Params = Promise<{ id: string }>;
type SP = Promise<{ next?: string; error?: string; signed?: string; withdrawn?: string }>;

const ERRORS: Record<string, string> = {
  agree: "Tick the box to agree before signing.",
  name: "Type your full name.",
  relationship: "Choose parent or legal guardian.",
  signature: "Sign in the box with your finger.",
  version: "The wording was just updated. Read it again and sign.",
  setup: CONSENT_SETUP_MESSAGE,
  save: "Couldn't save the consent. Try again.",
  withdraw: "Couldn't withdraw the consent. Try again.",
};

// Recording consent for one student: the teacher hands the iPad or phone to
// the parent, who reads the points, signs, and hands it back. A family
// account can also open it and sign on their own device. Also where the
// consent is shown and withdrawn.
export default function ConsentPage({ params, searchParams }: { params: Params; searchParams: SP }) {
  return (
    <Suspense fallback={<Shell title="Recording consent" tab="studio">{null}</Shell>}>
      <Body params={params} searchParams={searchParams} />
    </Suspense>
  );
}

function relationshipLabel(v: string): string {
  return CONSENT_RELATIONSHIPS.find((r) => r.value === v)?.label ?? v;
}

async function Body({ params, searchParams }: { params: Params; searchParams: SP }) {
  const viewer = await getViewer();
  const { id } = await params;
  const sp = await searchParams;
  // Only the student's teacher or their linked family can read the student.
  const student = await getStudent(id);
  if (!student) notFound();
  const isTeacher = !!viewer.teacher && viewer.teacher.id === student.teacher_id;
  const [status, history, teacher] = await Promise.all([
    getConsentStatus(id),
    listConsents(id),
    isTeacher ? Promise.resolve(viewer.teacher) : getTeacherForStudent(student),
  ]);
  const firstName = student.name.split(" ")[0] || student.name;
  const teacherName = teacher?.name || teacher?.studio_name || "";
  const home = isTeacher ? `/students/${id}` : `/family/${id}`;
  const next = typeof sp.next === "string" ? sp.next : "";
  const error = sp.error ? (ERRORS[sp.error] ?? ERRORS.save) : null;

  return (
    <Shell
      title={student.name}
      eyebrow="Recording consent"
      back={{ href: home, label: isTeacher ? student.name : `${firstName}'s practice` }}
      tab={isTeacher ? "studio" : "family"}
    >
      <div className="flex flex-col gap-5">
        {error && <Notice tone="danger">{error}</Notice>}
        {sp.signed && (
          <Notice tone="sage">
            Signed. Thank you.{isTeacher ? " You can hand the device back to the teacher." : ""}
          </Notice>
        )}
        {sp.withdrawn && <Notice tone="amber">Consent withdrawn. {firstName} can&apos;t be recorded until a new consent is signed.</Notice>}

        {status.state === "setup" && <Notice tone="amber">{CONSENT_SETUP_MESSAGE}</Notice>}

        {status.state === "signed" && (
          <Card tone="sage" className="flex flex-col gap-3">
            <div className="text-[17px] font-semibold">✓ {firstName} can be recorded</div>
            <p className="text-[16px]">
              Signed by <b>{status.consent.signerName}</b> ({relationshipLabel(status.consent.relationship).toLowerCase()}) on{" "}
              <LocalDateTime iso={status.consent.signedAt} />
              {status.consent.collectedEmail ? `, collected by ${status.consent.collectedEmail}` : ""}.
            </p>
            <div className="flex flex-wrap gap-2">
              <LinkButton href={home} className="min-h-10 px-4">
                Back to {firstName}
              </LinkButton>
            </div>
          </Card>
        )}

        {status.state === "needed" && (
          <>
            {status.last?.revokedAt ? (
              <Notice tone="amber">
                The last consent was withdrawn on <LocalDateTime iso={status.last.revokedAt} />. A new signature is needed
                before {firstName} can be recorded again.
              </Notice>
            ) : status.last && status.last.version !== CONSENT_VERSION ? (
              <Notice tone="amber">The wording has changed since the last signature. Please read it and sign again.</Notice>
            ) : (
              <Notice tone="amber">
                Before {firstName} can be recorded, a parent or guardian needs to read and sign this.
                {isTeacher ? " Hand them this screen." : ""}
              </Notice>
            )}
          </>
        )}

        {status.state !== "setup" && (
          <Card className="flex flex-col gap-4">
            <h2 className="font-display text-2xl font-medium">{consentHeading(student.name)}</h2>
            <p className="text-[16px]">I am {student.name}&apos;s parent or legal guardian, and I agree that:</p>
            <ol className="flex list-decimal flex-col gap-3 pl-6 text-[16px] leading-relaxed">
              {consentPoints(student.name, teacherName).map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ol>
            {status.state === "needed" && (
              <div className="border-t border-rule pt-4">
                <ConsentForm studentId={id} next={next} />
              </div>
            )}
          </Card>
        )}

        {status.state === "signed" && (
          <section>
            <SectionTitle>Withdraw consent</SectionTitle>
            <Card className="flex flex-col gap-3">
              <p className="text-sm text-muted">
                {isTeacher
                  ? "If the family asks to stop, withdraw here. New recordings and AI notes stop straight away. Videos already recorded stay until you delete them from the lesson pages. The signed record is kept."
                  : `To stop recordings of ${firstName}, withdraw here. New recordings and AI notes stop straight away, and ${teacherName || "the teacher"} sees that you withdrew. Ask them to delete videos already recorded. The signed record is kept.`}
              </p>
              <form action={withdrawConsent} className="flex flex-col gap-3">
                <input type="hidden" name="student_id" value={id} />
                <input type="hidden" name="consent_id" value={status.consent.id} />
                <Textarea name="reason" placeholder="Note (optional), for example who asked and how" className="min-h-16" />
                <ConfirmSubmit
                  message={`Withdraw recording consent for ${student.name}? Recording stops until a new consent is signed.`}
                  className="self-start rounded-xl border border-danger/40 px-4 py-2 text-sm font-semibold text-danger hover:bg-danger-soft"
                >
                  Withdraw consent
                </ConfirmSubmit>
              </form>
            </Card>
          </section>
        )}

        {history && history.length > 0 && (
          <section>
            <SectionTitle>Record</SectionTitle>
            <ul className="flex flex-col gap-2 text-sm">
              {history.map((c) => (
                <li key={c.id} className="rounded-xl border border-rule bg-sheet px-3 py-2">
                  Signed by <b>{c.signerName}</b> ({relationshipLabel(c.relationship).toLowerCase()}) on{" "}
                  <LocalDateTime iso={c.signedAt} />
                  {c.collectedEmail ? ` · collected by ${c.collectedEmail}` : ""} · wording {c.version}
                  {c.revokedAt && (
                    <span className="text-danger">
                      {" "}
                      · withdrawn <LocalDateTime iso={c.revokedAt} />
                      {c.revokedEmail ? ` by ${c.revokedEmail}` : ""}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        <p className="text-xs text-muted">
          This page records a parent&apos;s permission in plain words. It isn&apos;t legal advice.
        </p>
      </div>
    </Shell>
  );
}
