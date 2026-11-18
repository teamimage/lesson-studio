import { STATUS_LABEL } from "@/lib/families";

// Signed in / Invite sent / Not invited yet, coloured.
export function GuardianStatus({ status }: { status: "signed-in" | "invited" | "not-invited" }) {
  return (
    <span className={status === "signed-in" ? "text-sage" : status === "invited" ? "text-plum" : undefined}>
      {status === "signed-in" ? "✓ " : ""}
      {STATUS_LABEL[status]}
    </span>
  );
}
