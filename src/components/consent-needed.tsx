import { Card, LinkButton } from "@/components/ui";
import { CONSENT_SETUP_MESSAGE, consentNeededMessage, consentPath } from "@/lib/recording-consent";

// Shown in place of anything that records a student (Start lesson, video
// upload, practice recording) until a parent or guardian has signed.
export function ConsentNeeded({
  studentId,
  studentName,
  state,
  next,
  what,
  canCollect = true,
  selfSign = false,
}: {
  studentId: string;
  studentName: string;
  state: "needed" | "setup";
  /** Where to come back to after signing. */
  next?: string;
  /** What is waiting, e.g. "the lesson" or "uploading a video". */
  what?: string;
  /** False hides the form link (the teacher previewing as a family). */
  canCollect?: boolean;
  /** A family account signing on their own device. */
  selfSign?: boolean;
}) {
  const firstName = studentName.split(" ")[0] || studentName;
  if (state === "setup") {
    return (
      <Card tone="amber" className="text-[16px]">
        {CONSENT_SETUP_MESSAGE}
      </Card>
    );
  }
  return (
    <Card tone="amber" className="flex flex-col gap-3">
      <div className="text-[17px] font-semibold">Parent consent needed to record</div>
      <p className="text-[16px]">
        {consentNeededMessage(firstName)}
        {what ? ` Collect it before ${what}.` : ""}
        {!canCollect
          ? " Ask the teacher for the form."
          : selfSign
            ? " A parent or guardian can read and sign it here. It takes a minute."
            : " Open the form and hand this device to the parent or guardian. It takes a minute."}
      </p>
      {canCollect && (
        <LinkButton href={consentPath(studentId, next)} className="min-h-12 self-start px-5">
          {selfSign ? "Read and sign" : "Collect parent consent"}
        </LinkButton>
      )}
    </Card>
  );
}
