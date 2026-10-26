import { Shell } from "@/components/shell";
import { LinkButton } from "@/components/ui";

export default function NotFound() {
  return (
    <Shell title="Not found" eyebrow="Hmm">
      <p className="mb-4 text-muted">That page doesn&apos;t exist, or it belongs to another studio.</p>
      <LinkButton href="/">Back to the studio</LinkButton>
    </Shell>
  );
}
