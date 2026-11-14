import Link from "next/link";
import { loadRunningRun } from "@/lib/craft/data";

// One flat line for Downbeat (and the lesson card): the running Focus
// program's habit for today, or a quiet way into Craft.
export async function CraftLine({ teacherId, compact }: { teacherId: string; compact?: boolean }) {
  const { run } = await loadRunningRun(teacherId);
  if (!run) {
    if (compact) return null;
    return (
      <Link href="/craft" className="self-start text-sm text-muted no-underline hover:text-accent-ink">
        Craft: one-week programs and reading for your own teaching ›
      </Link>
    );
  }
  const { program } = run;
  if (run.finished) {
    if (compact) return null;
    return (
      <Link href="/craft" className="block text-[15px] text-ink no-underline">
        <span className="font-semibold text-accent-ink">Focus finished:</span> {program.name}. See your result ›
      </Link>
    );
  }
  if (compact) {
    return (
      <div className="text-[15px]">
        <span className="font-semibold text-accent-ink">Focus:</span> {program.name.toLowerCase()}
      </div>
    );
  }
  const day = program.days[Math.min(run.day, program.days.length) - 1];
  const extra = run.day > program.days.length;
  return (
    <Link href="/craft" className="block border-l-2 border-accent pl-3 text-[15px] leading-snug text-ink no-underline">
      <span className="font-semibold text-accent-ink">
        Focus, day {run.day} of {run.lengthDays}:
      </span>{" "}
      {program.name}. {extra ? "Keep using this week's habits." : day.tryThis}{" "}
      <span className="text-accent-ink">›</span>
    </Link>
  );
}
