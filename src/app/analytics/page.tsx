import { Suspense } from "react";
import { Shell } from "@/components/shell";
import { Me } from "@/components/v3/me";
import { SectionTitle } from "@/components/ui";
import { Numbers } from "@/components/craft-view";
import { requireTeacher } from "@/lib/auth";
import { addDays, formatDate, todayISO } from "@/lib/format";
import { getPracticeWeek, listStudents } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { loadHabitLessons } from "@/lib/craft/data";

// Analytics, reached from the Craft section on Intro. Only numbers the app
// already keeps: home practice since each student's last lesson, lessons in
// the last 30 days, and the teaching habits counted from lesson transcripts.
// Teacher-only.
export default function AnalyticsPage() {
  return (
    <Shell title="Analytics" eyebrow="For you, not your families" back={{ href: "/downbeat#craft", label: "Intro" }} tab="downbeat" me={<Me />}>
      <Suspense fallback={<div className="h-60 animate-pulse rounded-2xl bg-sheet" />}>
        <Body />
      </Suspense>
    </Shell>
  );
}

async function Body() {
  const { teacher } = await requireTeacher();
  const today = todayISO();
  const from = addDays(today, -29);
  const supabase = await createClient();
  const [students, habitLessons, { data: lessonRows }] = await Promise.all([
    listStudents(),
    loadHabitLessons(teacher.id, 20),
    supabase
      .from("lessons")
      .select("student_id, lesson_date, duration_minutes")
      .eq("teacher_id", teacher.id)
      .gte("lesson_date", from)
      .lte("lesson_date", today),
  ]);
  const active = students.filter((s) => s.active);
  const weeks = await Promise.all(active.map((s) => getPracticeWeek(s.id, today)));

  const lessonsBy = new Map<string, { count: number; minutes: number }>();
  for (const l of lessonRows ?? []) {
    const t = lessonsBy.get(l.student_id) ?? { count: 0, minutes: 0 };
    t.count++;
    t.minutes += l.duration_minutes ?? 0;
    lessonsBy.set(l.student_id, t);
  }
  const first = (name: string) => name.trim().split(/\s+/)[0] || name;

  return (
    <div className="flex flex-col gap-9">
      <section>
        <SectionTitle>Home practice since the last lesson</SectionTitle>
        {active.length === 0 ? (
          <p className="m-0 text-sm text-muted">No students yet.</p>
        ) : (
          <div className="-mx-1 overflow-x-auto">
            <table className="w-full min-w-[20rem] border-collapse text-[15px]">
              <thead>
                <tr className="text-left text-[13px] text-muted">
                  <th className="px-1 pb-1.5 font-medium">Student</th>
                  <th className="px-1 pb-1.5 text-right font-medium">Days practised</th>
                  <th className="px-1 pb-1.5 text-right font-medium">Minutes</th>
                </tr>
              </thead>
              <tbody>
                {active.map((s, i) => {
                  const w = weeks[i];
                  return (
                    <tr key={s.id} className="border-t border-rule">
                      <td className="px-1 py-2">
                        {first(s.name)}
                        <div className="text-[13px] text-muted">
                          {w.since ? `since ${formatDate(w.since)}` : "last 7 days"}
                        </div>
                      </td>
                      <td className="px-1 py-2 text-right tabular-nums">
                        {w.daysPracticed} of {w.days.length}
                      </td>
                      <td className="px-1 py-2 text-right tabular-nums">{w.totalMinutes}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <SectionTitle>Lessons in the last 30 days</SectionTitle>
        {active.length === 0 ? (
          <p className="m-0 text-sm text-muted">No students yet.</p>
        ) : (
          <div className="-mx-1 overflow-x-auto">
            <table className="w-full min-w-[20rem] border-collapse text-[15px]">
              <thead>
                <tr className="text-left text-[13px] text-muted">
                  <th className="px-1 pb-1.5 font-medium">Student</th>
                  <th className="px-1 pb-1.5 text-right font-medium">Lessons</th>
                  <th className="px-1 pb-1.5 text-right font-medium">Minutes</th>
                </tr>
              </thead>
              <tbody>
                {active.map((s) => {
                  const t = lessonsBy.get(s.id) ?? { count: 0, minutes: 0 };
                  return (
                    <tr key={s.id} className="border-t border-rule">
                      <td className="px-1 py-2">{first(s.name)}</td>
                      <td className="px-1 py-2 text-right tabular-nums">{t.count}</td>
                      <td className="px-1 py-2 text-right tabular-nums">{t.minutes || "–"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Numbers lessons={habitLessons} limit={20} />
    </div>
  );
}
