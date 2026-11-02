import { instrumentIcon, instrumentLabel } from "@/lib/constants";
import { cx } from "./ui";

/** Small instrument label that sits next to a student's name. */
export function InstrumentTag({ instrument, className }: { instrument: string; className?: string }) {
  if (!instrument) return null;
  return (
    <span
      className={cx(
        "inline-flex shrink-0 items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 align-middle font-sans text-xs font-medium leading-5 tracking-normal text-accent-ink",
        className,
      )}
    >
      <span aria-hidden>{instrumentIcon(instrument)}</span>
      {instrumentLabel(instrument)}
    </span>
  );
}
