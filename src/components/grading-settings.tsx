import { Button, Card, Notice, SectionTitle, Select, cx, textareaClass } from "@/components/ui";
import { saveStudentGrading, saveStudioGrading } from "@/app/settings/grading-actions";
import {
  GRADE_TONE,
  GRADING_STANDARDS,
  GRADING_SYSTEMS,
  DEFINITION_MAX,
  PRESET_DEFINITIONS,
  STANDARD_LABELS,
  SYSTEM_LABELS,
  definitionsFor,
  gradeMark,
  parseStudentGrading,
  type GradingConfig,
} from "@/lib/grading";

// Settings, Grading: the studio default (system, standard, what each grade
// means) and any student set apart from it.
export function GradingSettings({
  studio,
  students,
  saved,
}: {
  studio: GradingConfig;
  students: { id: string; name: string; instrument: string | null; grading?: unknown }[];
  saved?: string;
}) {
  const defs = definitionsFor(studio);
  return (
      <div className="flex flex-col gap-8">
        {saved === "setup" && (
          <Notice tone="danger">Run grading.sql in the Supabase SQL Editor first, then save again.</Notice>
        )}
        {saved === "studio" && <Notice tone="sage">Saved. New practice reviews use this from now on.</Notice>}
        {saved === "students" && <Notice tone="sage">Student settings saved.</Notice>}

        <section>
          <SectionTitle>How practice is graded</SectionTitle>
          <p className="mb-3 text-[15px] text-muted">
            For every student unless you change one below. Families see the grade and what it means, but can&apos;t change
            it. Reviews already written keep their grade; &quot;Review again&quot; regrades one.
          </p>
          <form action={saveStudioGrading} className="flex flex-col gap-5">
            <Card className="flex flex-col gap-2">
              <div className="font-semibold">System</div>
              {GRADING_SYSTEMS.map((s) => (
                <label key={s} className="flex items-start gap-2.5 py-1">
                  <input type="radio" name="system" value={s} defaultChecked={studio.system === s} className="mt-1.5" />
                  <span>
                    <span className="font-medium">{SYSTEM_LABELS[s].label}</span>
                    <span className="block text-sm text-muted">{SYSTEM_LABELS[s].hint}</span>
                  </span>
                </label>
              ))}
            </Card>

            <Card className="flex flex-col gap-2">
              <div className="font-semibold">Standard</div>
              <p className="text-sm text-muted">
                How high the bar is. Separate from review tone, which only changes how the words sound.
              </p>
              {GRADING_STANDARDS.map((s) => (
                <label key={s} className="flex items-start gap-2.5 py-1">
                  <input type="radio" name="standard" value={s} defaultChecked={studio.standard === s} className="mt-1.5" />
                  <span>
                    <span className="font-medium">{STANDARD_LABELS[s].label}</span>
                    <span className="block text-sm text-muted">{STANDARD_LABELS[s].hint}</span>
                  </span>
                </label>
              ))}
            </Card>

            {studio.system !== "none" && (
              <Card className="flex flex-col gap-3">
                <div>
                  <div className="font-semibold">What each grade means</div>
                  <p className="text-sm text-muted">
                    The reviewer grades by these words and families read them. Rewrite any in your own words; leave one
                    blank to use the {STANDARD_LABELS[studio.standard].label.toLowerCase()} wording. Save after changing
                    the system or standard to see its wording here.
                  </p>
                </div>
                {defs.map((d) => (
                  <label key={d.grade} className="flex items-start gap-3">
                    <span
                      className={cx(
                        "mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-display text-xl font-semibold",
                        GRADE_TONE[d.grade],
                      )}
                      aria-label={d.grade}
                    >
                      {gradeMark(d.grade)}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="text-sm font-medium">
                        {d.grade}
                        {d.custom && <span className="ml-2 text-muted">your wording</span>}
                      </span>
                      <textarea
                        name={`def_${d.grade}`}
                        defaultValue={d.text}
                        placeholder={PRESET_DEFINITIONS[studio.standard][d.grade]}
                        maxLength={DEFINITION_MAX}
                        rows={4}
                        className={cx(textareaClass, "min-h-0 text-[16px] leading-snug")}
                      />
                    </span>
                  </label>
                ))}
                {defs.some((d) => d.custom) && (
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="reset" value="1" /> Go back to the preset wording for every grade
                  </label>
                )}
              </Card>
            )}

            <Button>Save grading</Button>
          </form>
        </section>

        {students.length > 0 && (
          <section id="students" className="scroll-mt-6">
            <SectionTitle>Per student</SectionTitle>
            <p className="mb-3 text-[15px] text-muted">
              A beginner might be on Gentle or Pass or fail while an older student is on Demanding.
            </p>
            <form action={saveStudentGrading} className="flex flex-col gap-3">
              {students.map((s) => {
                const own = parseStudentGrading(s.grading);
                const custom = own && !own.follows_studio ? own : null;
                return (
                  <Card key={s.id} className="flex flex-col gap-2">
                    <div className="font-semibold">
                      {s.name}
                      {s.instrument && <span className="ml-2 font-normal text-muted">{s.instrument}</span>}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Select name={`system_${s.id}`} defaultValue={custom?.system ?? "studio"} aria-label={`System for ${s.name}`}>
                        <option value="studio">Studio ({SYSTEM_LABELS[studio.system].label.toLowerCase()})</option>
                        {GRADING_SYSTEMS.map((g) => (
                          <option key={g} value={g}>
                            {SYSTEM_LABELS[g].label}
                          </option>
                        ))}
                      </Select>
                      <Select name={`standard_${s.id}`} defaultValue={custom?.standard ?? "studio"} aria-label={`Standard for ${s.name}`}>
                        <option value="studio">Studio ({STANDARD_LABELS[studio.standard].label.toLowerCase()})</option>
                        {GRADING_STANDARDS.map((g) => (
                          <option key={g} value={g}>
                            {STANDARD_LABELS[g].label}
                          </option>
                        ))}
                      </Select>
                    </div>
                  </Card>
                );
              })}
              <Button variant="secondary">Save student settings</Button>
            </form>
          </section>
        )}
      </div>
  );
}
