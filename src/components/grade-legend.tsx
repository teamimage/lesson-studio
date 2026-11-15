import { cx } from "@/components/ui";
import {
  DEFAULT_GRADING,
  GRADE_TONE,
  STANDARD_LABELS,
  definitionsFor,
  gradeMark,
  instrumentFamily,
  type GradingConfig,
} from "@/lib/grading";

// "What do grades mean?": a small link next to the practice grade and the
// practice chart that opens, in place, a short key to the A-F practice
// grade and the intonation scale. Families get plain words in big type;
// the teacher also gets what the reviewer weighs and the verdict cut-offs.
// Keep this in step with the grade instructions in
// src/lib/ai/analyze-practice.ts and the cents bands in
// src/lib/practice/intonation.ts.

export { GRADE_TONE } from "@/lib/grading";

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
  grading = DEFAULT_GRADING,
  instrument,
}: {
  /** Parent and child wording, in big type. */
  family?: boolean;
  className?: string;
  label?: string;
  /** The student's grading system, standard and definitions. */
  grading?: GradingConfig;
  /** Leaves out the intonation key for piano. */
  instrument?: string | null;
}) {
  const grades = definitionsFor(grading);
  const passFail = grading.system === "pass_fail";
  const showTuning = instrumentFamily(instrument) !== "piano";
  if (grading.system === "none" && !showTuning) return null;
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
        {grading.system === "none" ? (
          <p>{family ? "Practice isn't graded. The reviews say what went well and what to work on." : "Grades are off for this student. Reviews still list what went well and what to work on."}</p>
        ) : (
          <p>
            {family
              ? `Each recorded practice gets ${passFail ? "a pass or a fail" : "one letter"} for the session as a whole. It's about how the practice time was used, not talent, not how hard the music is, and not how long it was.`
              : `${passFail ? "Pass or fail" : "One letter"} per recorded session, on your ${STANDARD_LABELS[grading.standard].label} standard: how well the practice time was used, judged from the recording against the current lesson's list. Not talent, not difficulty, not length.`}
          </p>
        )}

        <ul className="flex flex-col gap-2">
          {grades.map(({ grade: g, text }) => (
            <li key={g} className="flex items-start gap-3">
              <span
                className={cx(
                  "flex shrink-0 items-center justify-center rounded-xl font-display font-semibold",
                  family ? "h-10 w-10 text-xl" : "h-8 w-8 text-lg",
                  GRADE_TONE[g],
                )}
              >
                {gradeMark(g)}
              </span>
              <span className="pt-1">
                {passFail && <span className="font-semibold">{g}: </span>}
                {text}
              </span>
            </li>
          ))}
        </ul>

        {grading.system !== "none" &&
          (family ? (
            <p>
              <strong>What helps:</strong> working on the teacher&apos;s focus first, slow careful work on the hard
              spots, then playing them through. A short practice can get {passFail ? "a pass" : "an A"}.
            </p>
          ) : (
            <div>
              <div className="font-semibold">What the reviewer weighs</div>
              <ul className="mt-1 list-disc pl-5">
                <li>Your focus first, then how much of the list got real work.</li>
                <li>Method: looping and slowing hard spots, then getting through, rather than restarting or only playing through.</li>
                <li>
                  {instrumentFamily(instrument) === "piano"
                    ? "Care: steady pulse, right notes and evenness. Hands together, voicing and pedalling can't be heard from the phone, so they don't count."
                    : "Care: steady pulse, right notes and measured intonation."}
                </li>
                <li>Length doesn&apos;t count either way. Change the system, standard or wording in Settings, Grading.</li>
              </ul>
            </div>
          ))}

        {showTuning && (
        <div>
          <div className="font-semibold">{family ? "In tune is checked separately" : "Intonation, a separate measure"}</div>
          <p className="mt-1">
            {family
              ? "The app also measures each held note against the instrument's tuning. A cent is a tiny step in pitch (100 cents make one half step):"
              : "Measured by code, not the AI: each held note (a quarter second or longer) against A=440 when the strings were tuned with the app's tuner, otherwise against the tuning heard on the open strings (else A=440)."}
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
        )}

        <ul className={cx("flex flex-col gap-1", family ? "" : "text-muted")}>
          <li>
            {family
              ? "More than one session in a day? The calendar shows the best grade."
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
