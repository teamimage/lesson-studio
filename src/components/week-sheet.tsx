import type { ReactNode } from "react";
import type { Student } from "@/lib/data";
import type { Tables } from "@/lib/supabase/types";
import { capitalize, formatDate, parseISODate } from "@/lib/format";
import { weekLabel, type CheckGridRow, type WeekData } from "@/lib/practice/week";

// The weekly practice review as a printable page: the week's numbers, check
// marks per day for every assigned item and current piece, and Claude's short
// summary (encouraging line, going well, things to work on, trends).
// Fixed colours so it prints the same in dark mode.

const C = {
  ink: "#1b1613",
  muted: "#5d524a",
  accent: "#8f4a2a",
  line: "#e6dbcc",
  box: "#c9b9a8",
  sage: "#5f8068",
  sageSoft: "#e2ece3",
  accentSoft: "#f6e3d7",
};

function H({ children }: { children: ReactNode }) {
  return <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#8f4a2a]">{children}</div>;
}

function change(now: number, before: number, unit: string): string | null {
  if (!before && !now) return null;
  if (now === before) return `same as last week`;
  return `${now > before ? "up" : "down"} from ${before}${unit}`;
}

export function WeekSheet({
  week: w,
  student,
  teacher,
  teacherView,
  writer,
}: {
  week: WeekData;
  student: Student;
  teacher: Tables<"teachers"> | null;
  teacherView: boolean;
  /** Shown where the written review goes while it doesn't exist yet. */
  writer?: ReactNode;
}) {
  const firstName = student.name.split(" ")[0];
  const r = w.review;
  const dayCount = w.isCurrent ? w.days.filter((d) => d <= w.through).length : 7;
  const sessions = w.sessions.filter((s) => s.status === "done" && s.review);

  return (
    <>
      <article className="sheet mx-auto my-2 w-full max-w-[8.5in] bg-white px-6 py-7 text-[#1b1613] shadow-sm print:my-0 print:max-w-none print:shadow-none sm:px-10 sm:py-9">
        <header className="flex flex-wrap items-end justify-between gap-2 border-b-2 border-[#b4623c] pb-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#8f4a2a]">Weekly practice review</div>
            <h1 className="mt-0.5 text-[26px] font-semibold leading-tight">{firstName}&apos;s practice week</h1>
            <div className="mt-1 text-sm text-[#5d524a]">
              {capitalize(student.instrument)}
              {student.current_book ? ` · ${student.current_book}` : ""}
            </div>
          </div>
          <div className="text-right text-sm text-[#5d524a]">
            <div className="font-medium text-[#1b1613]">{weekLabel(w.start)}</div>
            {w.isCurrent && <div>so far, through {formatDate(w.through, "weekday")}</div>}
            {teacher?.name && <div>{teacher.name}</div>}
          </div>
        </header>

        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat
            value={`${w.stats.daysPracticed}/${dayCount}`}
            label="days practised"
            sub={w.isCurrent ? null : change(w.stats.daysPracticed, w.prevStats.daysPracticed, "")}
          />
          <Stat
            value={`${w.stats.totalMinutes}`}
            label="minutes"
            sub={w.isCurrent ? null : change(w.stats.totalMinutes, w.prevStats.totalMinutes, " min")}
          />
          <Stat value={`${w.stats.sessions}`} label="recorded sessions" sub={null} />
          <Stat value={`${w.stats.playingMinutes}`} label="minutes of playing heard" sub={null} />
        </div>

        {r ? (
          <section className="mt-5 flex flex-col gap-3 text-[15px] leading-relaxed">
            {r.encouragement && (
              <div className="rounded-lg bg-[#f6e3d7] px-3 py-2 text-[17px] font-medium">{r.encouragement}</div>
            )}
            {r.summary && <p>{r.summary}</p>}
            <div className="grid gap-3 sm:grid-cols-2 print:grid-cols-2">
              <Points title="Going well" color={C.sage} bg={C.sageSoft} items={r.going_well.map((p) => p.text)} />
              <Points title="Things to work on" color={C.accent} bg={C.accentSoft} items={r.work_on.map((p) => p.text)} />
            </div>
            {r.trends.length > 0 && (
              <div>
                <H>Trends</H>
                <ul className="mt-1 list-disc pl-5">
                  {r.trends.map((t, i) => (
                    <li key={i}>{t}</li>
                  ))}
                </ul>
              </div>
            )}
            {teacherView && r.teacher_note && (
              <div className="no-print rounded-lg border border-[#e6dbcc] px-3 py-2 text-sm">
                <span className="font-medium text-[#8f4a2a]">Teacher only: </span>
                {r.teacher_note}
              </div>
            )}
          </section>
        ) : (
          writer && <section className="mt-5">{writer}</section>
        )}

        {(w.assigned.length > 0 || w.current.length > 0) && (
          <section className="mt-6">
            <H>Check marks</H>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full border-collapse text-[14px]">
                <thead>
                  <tr className="text-[11px] text-[#5d524a]">
                    <th className="py-1 pr-2 text-left font-medium" />
                    {w.days.map((d) => (
                      <th key={d} className="w-7 py-1 text-center font-medium sm:w-9">
                        {parseISODate(d).toLocaleDateString("en-US", { weekday: "short" }).slice(0, 2)}
                      </th>
                    ))}
                    <th className="w-8 py-1 text-center font-medium sm:w-10">Days</th>
                  </tr>
                </thead>
                <tbody>
                  {w.assigned.length > 0 && <GroupRow label="Assigned" />}
                  {w.assigned.map((row) => (
                    <GridRow key={row.key} row={row} days={w.days} through={w.through} />
                  ))}
                  {w.current.length > 0 && <GroupRow label="Current pieces (heard in a recording)" />}
                  {w.current.map((row) => (
                    <GridRow key={row.key} row={row} days={w.days} through={w.through} />
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {sessions.length > 0 && (
          <section className="mt-6">
            <H>Recorded sessions</H>
            <ul className="mt-1 flex flex-col gap-1 text-[14px]">
              {sessions.map((s) => (
                <li key={s.id} className="grid grid-cols-[110px_1fr] gap-2">
                  <span className="text-[#5d524a]">
                    {formatDate(s.practice_date, "weekday")} · {Math.max(1, Math.round(s.duration_seconds / 60))} min
                  </span>
                  <span>
                    {s.review?.counted === false ? <span className="text-[#5d524a]">Not counted. </span> : null}
                    {s.review?.summary}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {w.logs.some((l) => l.parent_note?.trim()) && (
          <section className="mt-6">
            <H>Parent notes</H>
            <ul className="mt-1 flex flex-col gap-1 text-[14px]">
              {w.logs
                .filter((l) => l.parent_note?.trim())
                .map((l) => (
                  <li key={l.id}>
                    <span className="text-[#5d524a]">{formatDate(l.practice_date, "weekday")}: </span>
                    {l.parent_note}
                  </li>
                ))}
            </ul>
          </section>
        )}

        {!w.hasActivity && (
          <p className="mt-6 text-[15px] text-[#5d524a]">No practice logged or recorded this week{w.isCurrent ? " yet" : ""}.</p>
        )}

        <footer className="mt-8 flex items-center justify-between border-t border-[#e6dbcc] pt-3 text-xs text-[#5d524a]">
          <span>Lesson Studio</span>
          <span>{teacher?.studio_name ?? ""}</span>
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

function Stat({ value, label, sub }: { value: string; label: string; sub: string | null }) {
  return (
    <div className="rounded-lg border border-[#e6dbcc] px-3 py-2">
      <div className="text-[22px] font-semibold leading-tight">{value}</div>
      <div className="text-[12px] text-[#5d524a]">{label}</div>
      {sub && <div className="text-[11px] text-[#5d524a]">{sub}</div>}
    </div>
  );
}

function Points({ title, color, bg, items }: { title: string; color: string; bg: string; items: string[] }) {
  if (!items.length) return <div />;
  return (
    <div className="rounded-lg px-3 py-2" style={{ background: bg }}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color }}>
        {title}
      </div>
      <ul className="mt-1 list-disc pl-5">
        {items.map((t, i) => (
          <li key={i}>{t}</li>
        ))}
      </ul>
    </div>
  );
}

function GroupRow({ label }: { label: string }) {
  return (
    <tr>
      <td colSpan={9} className="pt-2 pb-0.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-[#5d524a]">
        {label}
      </td>
    </tr>
  );
}

function GridRow({ row, days, through }: { row: CheckGridRow; days: string[]; through: string }) {
  const set = new Set(row.days);
  return (
    <tr className="border-t border-[#e6dbcc]">
      <td className="py-1.5 pr-2">{row.title}</td>
      {days.map((d) => (
        <td key={d} className="py-1.5 text-center">
          {set.has(d) ? (
            <span
              className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] text-white sm:h-5 sm:w-5 sm:text-[11px]"
              style={{ background: C.sage }}
            >
              ✓
            </span>
          ) : (
            <span
              className="inline-block h-4 w-4 rounded-full border sm:h-5 sm:w-5"
              style={{ borderColor: d > through ? C.line : C.box }}
            />
          )}
        </td>
      ))}
      <td className="py-1.5 text-center font-medium">{set.size}</td>
    </tr>
  );
}
