import Link from "next/link";
import type { ReactNode } from "react";
import { Button, SectionTitle } from "@/components/ui";
import { CraftCheckin } from "@/components/craft-checkin";
import { CraftSources as Sources } from "@/components/craft-sources";
import { formatDate } from "@/lib/format";
import { ARTICLES, type MetricKey, PROGRAMS } from "@/lib/craft/content";
import { type HabitLesson, MIN_LESSONS, type Measure, type Run } from "@/lib/craft/data";
import { endProgram, keepGoing, startProgram } from "@/app/craft/actions";

// The parts of the Craft page, given their data (so they can be shown with
// sample data too).

export function Running({ run, measure }: { run: Run; measure: Measure }) {
  const { program } = run;
  const dayIndex = Math.min(run.day, program.days.length) - 1;
  const extraWeek = run.day > program.days.length && !run.finished;
  const day = program.days[dayIndex];
  const tried = Object.values(run.checkins).filter((a) => a !== "no").length;
  const answered = Object.keys(run.checkins).length;

  return (
    <section className="flex flex-col gap-3">
      <div>
        <div className="text-[12px] font-semibold uppercase tracking-[0.12em] text-accent-ink">
          {run.finished ? "Focus · finished" : `Focus · day ${run.day} of ${run.lengthDays}`}
        </div>
        <h2 className="font-display text-2xl font-semibold">{program.name}</h2>
      </div>

      {run.finished ? (
        <p className="text-[15px] leading-relaxed">
          {run.lengthDays} days are up. Here is what your recorded lessons show. Keep going for another week, or finish
          and pick the next program.
        </p>
      ) : extraWeek ? (
        <div className="flex flex-col gap-2">
          <p className="text-[15px] leading-relaxed">
            Extra week: keep using the habits from the first seven days. Pick whichever fits today&apos;s lessons.
          </p>
          <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-[15px] leading-relaxed">
            {program.days.slice(0, -1).map((d) => (
              <li key={d.title}>{d.tryThis}</li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <h3 className="text-lg font-semibold leading-snug">{day.title}</h3>
          {day.read.map((p, i) => (
            <p key={i} className="m-0 text-[15px] leading-relaxed">
              {p}
            </p>
          ))}
          <p className="m-0 border-l-2 border-accent pl-3 text-[15px] leading-relaxed">
            <span className="font-semibold">Try today: </span>
            {day.tryThis}
          </p>
          {day.sources && <Sources sources={day.sources} />}
        </div>
      )}

      {!run.finished && (
        <CraftCheckin key={run.day} runId={run.id} day={run.day} answer={run.checkins[run.day] ?? null} />
      )}
      {answered > 0 && (
        <p className="m-0 text-sm text-muted">
          Tried it on {tried} of the {answered} {answered === 1 ? "day" : "days"} you answered.
        </p>
      )}

      <Result run={run} measure={measure} />

      <div className="flex flex-wrap gap-2">
        {run.finished && (
          <form action={keepGoing}>
            <input type="hidden" name="run" value={run.id} />
            <Button type="submit">Keep going 7 more days</Button>
          </form>
        )}
        <form action={endProgram}>
          <input type="hidden" name="run" value={run.id} />
          <Button type="submit" variant={run.finished ? "secondary" : "ghost"}>
            {run.finished ? "Finish" : "Stop this program"}
          </Button>
        </form>
      </div>
    </section>
  );
}

function Result({ run, measure }: { run: Run; measure: Measure }) {
  const { program } = run;
  const fmt = (v: number | null) => (v == null ? "–" : formatMetric(program.metric, v));
  const enough = measure.duringLessons >= MIN_LESSONS;
  let verdict: string;
  if (measure.baseline == null) {
    verdict = "No recorded lessons before you started, so there is nothing to compare with. The number below is a starting point.";
  } else if (measure.during == null) {
    verdict = "No recorded lessons since you started yet. Record and process a lesson to see your number.";
  } else if (!enough) {
    verdict = `Based on ${measure.duringLessons} recorded ${measure.duringLessons === 1 ? "lesson" : "lessons"}: too few to call it a change yet.${run.finished ? " Another week would help." : ""}`;
  } else {
    const diff = measure.during - measure.baseline;
    const improved = program.better === "lower" ? diff < 0 : diff > 0;
    const small = Math.abs(diff) < (program.metric === "questions" ? 0.5 : 0.03);
    verdict = small
      ? `About the same as before, over ${measure.duringLessons} lessons.`
      : improved
        ? `Moved the way you wanted, over ${measure.duringLessons} lessons.`
        : `Moved the other way, over ${measure.duringLessons} lessons.`;
  }

  return (
    <div className="flex flex-col gap-1 border-t border-rule pt-3">
      <div className="text-sm font-semibold">{METRIC_LABEL[program.metric]}</div>
      <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
        <span className="text-[15px]">
          Before: <strong className="font-display text-xl">{fmt(measure.baseline)}</strong>{" "}
          <span className="text-sm text-muted">
            ({measure.baselineLessons} {measure.baselineLessons === 1 ? "lesson" : "lessons"})
          </span>
        </span>
        <span className="text-[15px]">
          Since you started: <strong className="font-display text-xl">{fmt(measure.during)}</strong>{" "}
          <span className="text-sm text-muted">
            ({measure.duringLessons} {measure.duringLessons === 1 ? "lesson" : "lessons"})
          </span>
        </span>
      </div>
      <p className="m-0 text-[15px]">{verdict}</p>
      <p className="m-0 text-sm text-muted">{program.metricHelp}</p>
    </div>
  );
}

export function Programs({ running, ready }: { running: string | null; ready: boolean }) {
  return (
    <section>
      <SectionTitle>Focus programs</SectionTitle>
      <p className="m-0 mb-3 text-sm text-muted">
        Seven days, one habit. A two-minute read and one thing to try each day, measured from your recorded lessons.
      </p>
      <FirstThenMore
        items={[...PROGRAMS]
          .sort((a, b) => Number(b.slug === running) - Number(a.slug === running))
          .map((p) => (
            <div key={p.slug} className="flex items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{p.name}</div>
                <div className="text-sm text-muted">{p.line}</div>
              </div>
              {running === p.slug ? (
                <span className="shrink-0 text-sm text-accent-ink">Running</span>
              ) : (
                ready && (
                  <form action={startProgram} className="shrink-0">
                    <input type="hidden" name="program" value={p.slug} />
                    <Button type="submit" variant={running ? "secondary" : "primary"}>
                      {running ? "Switch" : "Start"}
                    </Button>
                  </form>
                )
              )}
            </div>
          ))}
        noun="program"
      />
    </section>
  );
}

export function Numbers({ lessons, limit = 8 }: { lessons: HabitLesson[]; limit?: number }) {
  const shown = lessons.slice(0, limit);
  return (
    <section>
      <SectionTitle>Your lessons in numbers</SectionTitle>
      {shown.length === 0 ? (
        <p className="m-0 text-sm text-muted">
          Nothing yet. Numbers appear once a recorded lesson has been processed.
        </p>
      ) : (
        <>
          <div className="-mx-1 overflow-x-auto">
            <table className="w-full min-w-[22rem] border-collapse text-[15px]">
              <thead>
                <tr className="text-left text-[13px] text-muted">
                  <th className="px-1 pb-1.5 font-medium">Lesson</th>
                  <th className="px-1 pb-1.5 text-right font-medium">Your share of words</th>
                  <th className="px-1 pb-1.5 text-right font-medium">Questions / 10 min</th>
                  <th className="px-1 pb-1.5 text-right font-medium">Praise with nothing said</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((l) => (
                  <tr key={l.lessonId} className="border-t border-rule">
                    <td className="px-1 py-2">
                      <Link href={`/lessons/${l.lessonId}`} className="text-ink">
                        {formatDate(l.date)} <span className="text-muted">{l.student}</span>
                      </Link>
                    </td>
                    <td className="px-1 py-2 text-right tabular-nums">
                      {l.habits.teacherShare == null ? "–" : pct(l.habits.teacherShare)}
                    </td>
                    <td className="px-1 py-2 text-right tabular-nums">
                      {l.questionsPer10 == null ? "–" : l.questionsPer10.toFixed(1)}
                    </td>
                    <td className="px-1 py-2 text-right tabular-nums">
                      {l.habits.barePraiseShare == null
                        ? "–"
                        : `${l.habits.barePraise} of ${l.habits.praise}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="m-0 mt-2 text-sm text-muted">
            Counted from the words in each lesson&apos;s transcript, so read them as trends, not exact counts. You are
            taken to be whoever spoke most. Pauses and playing time can&apos;t be measured yet.
          </p>
        </>
      )}
    </section>
  );
}

export function Reading() {
  return (
    <section>
      <SectionTitle>Reading</SectionTitle>
      <FirstThenMore
        items={ARTICLES.map((a) => (
          <Link key={a.slug} href={`/craft/read/${a.slug}`} className="block py-3 text-ink no-underline">
            <div className="font-semibold">{a.title}</div>
            <div className="text-sm text-muted">
              {INSTRUMENT_LABEL[a.instrument]} · {a.minutes} min · {a.summary}
            </div>
          </Link>
        ))}
        noun="article"
      />
    </section>
  );
}

// The first item, then one "Show N more" that opens the rest in place.
function FirstThenMore({ items, noun }: { items: ReactNode[]; noun: string }) {
  const [first, ...rest] = items;
  return (
    <div className="flex flex-col">
      {first}
      {rest.length > 0 && (
        <details className="group">
          <summary className="flex min-h-11 cursor-pointer list-none items-center border-t border-rule text-sm font-medium text-accent-ink [&::-webkit-details-marker]:hidden">
            <span className="group-open:hidden">
              Show {rest.length} more {rest.length === 1 ? noun : `${noun}s`}
            </span>
            <span className="hidden group-open:inline">Show less</span>
          </summary>
          <div className="flex flex-col divide-y divide-rule border-t border-rule">{rest}</div>
        </details>
      )}
    </div>
  );
}

const METRIC_LABEL: Record<MetricKey, string> = {
  barePraise: "Praise with nothing said about what was good",
  teacherShare: "Your share of the words spoken",
  questions: "Questions you asked",
};

const INSTRUMENT_LABEL = { all: "All instruments", strings: "Strings", piano: "Piano" } as const;

const pct = (v: number) => `${Math.round(v * 100)}%`;

function formatMetric(metric: MetricKey, v: number) {
  return metric === "questions" ? v.toFixed(1) : pct(v);
}
