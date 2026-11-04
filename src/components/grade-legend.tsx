import { cx } from "@/components/ui";

// "What do grades mean?": a small link next to the practice grade and the
// practice chart that opens, in place, a short key to the A-F practice
// grade and the intonation scale. Families get plain words in big type;
// the teacher also gets what the reviewer weighs and the verdict cut-offs.
// Keep this in step with the grade instructions in
// src/lib/ai/analyze-practice.ts and the cents bands in
// src/lib/practice/intonation.ts.

export const GRADE_TONE: Record<string, string> = {
  A: "bg-sage text-white",
  B: "bg-sage/70 text-white",
  C: "bg-amber text-white",
  D: "bg-accent text-white",
  F: "bg-danger text-white",
};

const FAMILY_GRADES: [string, string][] = [
  ["A", "Focused practice. Most of the list, with real work on the hard spots."],
  ["B", "Good practice with one thing missing, like a skipped piece or no slow work."],
  ["C", "Some useful practice, but a lot left out, or mostly playing straight through."],
  ["D", "A little real practice, with a lot of wandering."],
  ["F", "Counted, but barely practice."],
];

const TEACHER_GRADES: [string, string][] = [
  ["A", "Focused practice that covered most of the list, with real work on hard spots."],
  ["B", "Good practice with one thing missing (a skipped assignment, little slow work)."],
  ["C", "Some useful practice, but much left out or mostly playing through."],
  ["D", "A little real practice in a lot of wandering."],
  ["F", "Counted, but barely practice."],
];

const TUNING_BANDS: [string, string][] = [
  ["within 7 cents", "in tune"],
  ["8 to 15 cents", "slightly off"],
  ["16 to 25 cents", "clearly off"],
  ["more than 25 cents", "out of tune"],
];

export function GradeLegend({
  family = false,
  className,
  label = "What do grades mean?",
}: {
  /** Parent and child wording, in big type. */
  family?: boolean;
  className?: string;
  label?: string;
}) {
  const grades = family ? FAMILY_GRADES : TEACHER_GRADES;
  return (
    <details className={cx("group", className)}>
      <summary
        className={cx(
          "inline-flex cursor-pointer list-none items-center gap-1.5 text-accent-ink underline decoration-dotted underline-offset-4 [&::-webkit-details-marker]:hidden",
          family ? "min-h-11 text-[17px]" : "min-h-9 text-sm",
        )}
      >
        <span
          aria-hidden
          className="flex h-5 w-5 items-center justify-center rounded-full border border-current text-[12px] font-semibold no-underline"
        >
          ?
        </span>
        <span className="group-open:hidden">{label}</span>
        <span className="hidden group-open:inline">Hide</span>
      </summary>

      <div
        className={cx(
          "mt-2 flex flex-col gap-3 rounded-2xl border border-rule bg-sheet p-3 text-ink",
          family ? "text-[18px] leading-relaxed" : "text-[15px]",
        )}
      >
        <p>
          {family
            ? "Each recorded practice gets one letter for the session as a whole. It's about how the practice time was used, not talent, and not how hard the music is."
            : "One letter per recorded session, for the session as a whole: how well the practice time was used, judged from the recording against the current lesson's list. Not talent, not how hard the music is."}
        </p>

        <ul className="flex flex-col gap-2">
          {grades.map(([g, text]) => (
            <li key={g} className="flex items-start gap-3">
              <span
                className={cx(
                  "flex shrink-0 items-center justify-center rounded-xl font-display font-semibold",
                  family ? "h-10 w-10 text-xl" : "h-8 w-8 text-lg",
                  GRADE_TONE[g],
                )}
              >
                {g}
              </span>
              <span className="pt-1">{text}</span>
            </li>
          ))}
        </ul>

        {family ? (
          <p>
            <strong>What helps the grade:</strong> doing the teacher&apos;s list, slow careful work on the hard spots,
            really playing (not long breaks or noodling), and playing in tune. If the notes are often out of tune, the
            grade can&apos;t be an A, however well the time was used.
          </p>
        ) : (
          <div>
            <div className="font-semibold">What the reviewer weighs</div>
            <ul className="mt-1 list-disc pl-5">
              <li>Coverage: assignments and current pieces worked on, especially your focus.</li>
              <li>Focused work: repeating hard spots, slow work, scales before pieces, rather than only playing through.</li>
              <li>Time on task: playing time against session length, few long breaks, a sensible length for the age.</li>
              <li>
                Care: steady tempo and intonation. An &quot;uneven&quot; or &quot;often out of tune&quot; intonation verdict
                keeps the grade below A.
              </li>
            </ul>
          </div>
        )}

        <div>
          <div className="font-semibold">{family ? "In tune is checked separately" : "Intonation, a separate measure"}</div>
          <p className="mt-1">
            {family
              ? "The app also measures each held note against the instrument's tuning. A cent is a tiny step in pitch (100 cents make one half step):"
              : "Measured by code, not the AI: each held note (a quarter second or longer) against the instrument's tuning, taken from the open strings, else A=440."}
          </p>
          <ul className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            {TUNING_BANDS.map(([cents, word]) => (
              <li key={cents} className="contents">
                <span className="text-muted">{cents}</span>
                <span className="font-medium">{word}</span>
              </li>
            ))}
          </ul>
          {!family && (
            <p className="mt-1.5 text-muted">
              Verdicts: &quot;in tune&quot; needs 85% of held notes within 7 cents and at most 2% beyond 25; &quot;mostly in
              tune&quot; 65% and 8%; &quot;uneven&quot; 45% and 15%; below that &quot;often out of tune&quot;. Right notes
              are counted apart from in tune.
            </p>
          )}
        </div>

        <ul className={cx("flex flex-col gap-1", family ? "" : "text-muted")}>
          <li>
            {family
              ? "More than one session in a day? The chart shows the best grade."
              : "Several sessions in a day: the day shows the best grade."}
          </li>
          <li>
            {family
              ? "Very short sessions (under 30 seconds of playing), or ones that weren't really practice, aren't counted and get no grade."
              : "Not counted, no grade: under 30 s of pitched sound, under 5% playing in a 5+ minute session, or judged not practice."}
          </li>
          <li>
            {family
              ? "The grade is written by the app from the recording. The teacher reads it too and has the final word."
              : "Written by Claude from the recording's note timeline and transcript; \"Review again\" re-grades a session."}
          </li>
        </ul>
      </div>
    </details>
  );
}
