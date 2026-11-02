import type { LessonFull, Student } from "@/lib/data";
import type { Tables } from "@/lib/supabase/types";
import { capitalize, formatDate, parseISODate } from "@/lib/format";

// The one-page printable lesson sheet for the parent. Plain, high-contrast,
// letter-size. Shown on its own page and inline on the Desk student card.
export function LessonSheet({
  lesson,
  student,
  teacher,
}: {
  lesson: LessonFull;
  student: Student;
  teacher: Tables<"teachers"> | null;
}) {
  const weekStart = parseISODate(lesson.lesson_date);
  const dayLabels = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i + 1);
    return d.toLocaleDateString("en-US", { weekday: "short" });
  });

  const firstName = student.name.split(" ")[0];

  return (
    <>
      <article className="sheet mx-auto my-2 w-full max-w-[8.5in] bg-white px-6 py-7 text-[#1b1613] shadow-sm print:my-0 print:max-w-none print:shadow-none sm:px-10 sm:py-9">
        <header className="flex flex-wrap items-end justify-between gap-2 border-b-2 border-[#b4623c] pb-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8f4a2a]">Lesson sheet</div>
            <h1 className="mt-0.5 text-[26px] font-semibold leading-tight">{firstName}&apos;s practice this week</h1>
            <div className="mt-1 text-sm text-[#5d524a]">
              {capitalize(student.instrument)}
              {student.current_book ? ` · ${student.current_book}` : ""}
            </div>
          </div>
          <div className="text-right text-sm text-[#5d524a]">
            <div className="font-medium text-[#1b1613]">{formatDate(lesson.lesson_date, "long")}</div>
            {teacher?.name && <div>{teacher.name}</div>}
            {teacher?.studio_name && <div>{teacher.studio_name}</div>}
          </div>
        </header>

        <dl className="mt-5 grid grid-cols-[110px_1fr] gap-x-4 gap-y-4 text-[15px] leading-relaxed">
          {lesson.summary && (
            <>
              <dt className="pt-0.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8f4a2a]">Today we</dt>
              <dd className="whitespace-pre-line">{lesson.summary}</dd>
            </>
          )}
          {lesson.focus_points && (
            <>
              <dt className="pt-0.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8f4a2a]">Focus point</dt>
              <dd className="whitespace-pre-line rounded-lg bg-[#f6e3d7] px-3 py-2 font-medium">{lesson.focus_points}</dd>
            </>
          )}
          {lesson.assignments.length > 0 && (
            <>
              <dt className="pt-0.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8f4a2a]">
                {lesson.assignments.every((a) => a.every_day) ? "Every day" : "Practice"}
              </dt>
              <dd>
                <ul className="flex flex-col gap-2">
                  {lesson.assignments.map((a) => (
                    <li key={a.id} className="grid grid-cols-[18px_1fr] gap-2">
                      <span className="mt-1 h-[14px] w-[14px] rounded-[3px] border-[1.5px] border-[#b4623c]" aria-hidden />
                      <span>
                        <span className="font-medium">{a.title}</span>
                        {a.how && <span className="text-[#5d524a]"> · {a.how}</span>}
                        {!a.every_day && <span className="text-[#5d524a]"> (not every day)</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              </dd>
            </>
          )}
          <dt className="pt-0.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8f4a2a]">Week tracker</dt>
          <dd>
            <div className="grid grid-cols-7 gap-1.5">
              {dayLabels.map((label, i) => (
                <div key={i} className="flex flex-col items-center gap-1">
                  <div className="h-9 w-full rounded-md border border-[#c9b9a8]" />
                  <div className="text-[11px] text-[#5d524a]">{label}</div>
                </div>
              ))}
            </div>
            <div className="mt-1 text-xs text-[#5d524a]">Tick a day when practice is done. A dot for listening.</div>
          </dd>
          {lesson.parent_message && (
            <>
              <dt className="pt-0.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8f4a2a]">From the teacher</dt>
              <dd className="italic">“{lesson.parent_message}”</dd>
            </>
          )}
          {lesson.next_lesson_date && (
            <>
              <dt className="pt-0.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8f4a2a]">Next lesson</dt>
              <dd>
                {formatDate(lesson.next_lesson_date, "long")}
                {student.lesson_time ? `, ${student.lesson_time}` : ""}
              </dd>
            </>
          )}
        </dl>

        <footer className="mt-8 flex items-center justify-between border-t border-[#e6dbcc] pt-3 text-xs text-[#5d524a]">
          <span>Lesson Studio</span>
          <span>Parent notes: ______________________________________________</span>
        </footer>
      </article>
      <style>{`
        @media print {
          @page { size: letter; margin: 0.5in; }
          .sheet { padding: 0 !important; }
        }
      `}</style>
    </>
  );
}
