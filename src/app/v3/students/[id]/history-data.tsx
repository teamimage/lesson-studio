import "server-only";
import { Entry, type TimelineEntry } from "@/components/v3/timeline";
import { PeriodReviewWriter } from "@/components/period-review-writer";
import { Pill } from "@/components/ui";
import { listLessons, listPracticeLogs } from "@/lib/data";
import { capitalize, formatDate, formatDuration, relativeDay } from "@/lib/format";
import { listPracticeSessions, type PracticeSessionView } from "@/lib/practice/data";
import { listPeriods, periodLabel } from "@/lib/practice/period";
import { listRecordingsForStudent } from "@/lib/recordings";

// The student's history for the Version 3 student page (last 10 days) and
// its "See all history" page: lessons, practice days, videos and practice
// reviews, newest first. Each entry's title opens that event's own page.

/** How much history to load: the student page needs a few weeks, "all" is everything kept. */
export async function loadHistory(studentId: string, all = false) {
  const [lessons, sessions, logs, periods, recordings] = await Promise.all([
    listLessons(studentId, all ? 1000 : 50),
    listPracticeSessions(studentId, all ? 1000 : 40),
    listPracticeLogs(studentId, all ? 2000 : 90),
    listPeriods(studentId, all ? 104 : 12),
    listRecordingsForStudent(studentId, all ? 1000 : 100),
  ]);
  // Unwritten reviews write themselves only on the student page (a dozen at
  // most); the full history offers a button so it never writes dozens at once.
  return { lessons, entries: buildEntries({ studentId, lessons, sessions, logs, periods, recordings, autoWrite: !all }) };
}

type Recording = Awaited<ReturnType<typeof listRecordingsForStudent>>[number];
type Logs = Awaited<ReturnType<typeof listPracticeLogs>>;
type Periods = Awaited<ReturnType<typeof listPeriods>>;
type Lessons = Awaited<ReturnType<typeof listLessons>>;

// Every dated thing about the student, newest first. Sort key is the day plus
// a rank, so on one day a lesson sits above the practice and the video.
export function buildEntries({
  studentId,
  lessons,
  sessions,
  logs,
  periods,
  recordings,
  autoWrite = true,
}: {
  studentId: string;
  lessons: Lessons;
  sessions: PracticeSessionView[];
  logs: Logs;
  periods: Periods;
  recordings: Recording[];
  autoWrite?: boolean;
}): TimelineEntry[] {
  const out: (TimelineEntry & { sort: string })[] = [];
  const lessonDate = new Map(lessons.map((l) => [l.id, l.lesson_date]));
  const dayLabel = (d: string) => `${capitalize(relativeDay(d))} · ${formatDate(d, "weekday")}`;

  for (const l of lessons) {
    const videos = recordings.filter((r) => r.lesson_id === l.id).length;
    out.push({
      key: `l-${l.id}`,
      kind: "lesson",
      day: dayLabel(l.lesson_date),
      date: l.lesson_date,
      sort: `${l.lesson_date}-3`,
      node: (
        <Entry
          title={`Lesson${l.lesson_pieces.length ? `: ${l.lesson_pieces.map((p) => p.title).join(", ")}` : ""}`}
          href={`/v3/lessons/${l.id}`}
          meta={
            [!l.summary && l.status === "draft" ? "Draft, not written up yet" : "", videos > 0 ? `${videos} video${videos === 1 ? "" : "s"}` : ""]
              .filter(Boolean)
              .join(" · ") || undefined
          }
          badge={<Pill tone={l.status === "draft" ? "amber" : "sage"}>{l.status === "draft" ? "Draft" : "Approved"}</Pill>}
          tone={l.status === "draft" ? "amber" : "sheet"}
        >
          {l.summary ? <p>{l.summary}</p> : null}
        </Entry>
      ),
    });
  }

  // One practice entry per day: the parent's log and any recorded sessions.
  const byDay = new Map<string, { log?: Logs[number]; sessions: PracticeSessionView[] }>();
  for (const log of logs) byDay.set(log.practice_date, { log, sessions: [] });
  for (const s of sessions) {
    const d = byDay.get(s.practice_date) ?? { sessions: [] };
    d.sessions.push(s);
    byDay.set(s.practice_date, d);
  }
  for (const [date, { log, sessions: daySessions }] of byDay) {
    const minutes = log?.minutes ?? Math.round(daySessions.reduce((n, s) => n + (s.playing_seconds ?? 0), 0) / 60);
    const ticked = log?.completed_assignment_ids.length ?? 0;
    const grades = daySessions.map((s) => s.review?.grade).filter(Boolean);
    const did = minutes > 0 || ticked > 0 || daySessions.length > 0;
    out.push({
      key: `p-${date}`,
      kind: "practice",
      day: dayLabel(date),
      date,
      sort: `${date}-2`,
      node: (
        <Entry
          title={did ? `Practice${minutes ? `, ${minutes} min` : ""}` : "Practice log, nothing ticked"}
          href={`/v3/students/${studentId}/practice/${date}`}
          meta={[
            ticked ? `${ticked} item${ticked === 1 ? "" : "s"} ticked` : "",
            log?.listened ? "listened" : "",
            daySessions.length ? `${daySessions.length} recorded` : "",
            log?.parent_note ? `“${log.parent_note}”` : "",
            daySessions.length ? "" : "logged by hand",
          ]
            .filter(Boolean)
            .join(" · ")}
          badge={grades.length ? <Pill tone="sage">{grades.join(" ")}</Pill> : undefined}
        >
          {daySessions.map((s) => s.review?.summary).filter(Boolean).map((t, i) => (
            <p key={i}>{t}</p>
          ))}
        </Entry>
      ),
    });
  }

  for (const r of recordings) {
    const date = (r.lesson_id ? lessonDate.get(r.lesson_id) : null) ?? r.created_at.slice(0, 10);
    out.push({
      key: `v-${r.id}`,
      kind: "video",
      day: dayLabel(date),
      date,
      sort: `${date}-1`,
      node: (
        <Entry
          title={`Video: ${r.label || r.file_name}`}
          href={r.lesson_id ? `/v3/lessons/${r.lesson_id}` : undefined}
          meta={[r.duration_seconds ? formatDuration(Number(r.duration_seconds)) : "", r.stream_status === "ready" ? "ready to stream" : ""]
            .filter(Boolean)
            .join(" · ")}
        >

        </Entry>
      ),
    });
  }

  for (const p of periods) {
    const date = p.end;
    out.push({
      key: `r-${p.start}`,
      kind: "review",
      day: dayLabel(date),
      date,
      sort: `${date}-0`,
      node: (
        <Entry
          tone="plum"
          title={`Practice review: ${periodLabel(p)}`}
          href={`/family/${studentId}/review/${p.start}`}
          meta={`${p.daysPracticed} of ${p.dayCount} days · ${p.totalMinutes} min${p.sessions ? ` · ${p.sessions} recorded` : ""}`}
        >
          {p.needsWriting && <PeriodReviewWriter studentId={studentId} start={p.start} auto={autoWrite} quiet={autoWrite} />}
          {p.encouragement && <p>{p.encouragement}</p>}

        </Entry>
      ),
    });
  }

  return out.sort((a, b) => b.sort.localeCompare(a.sort));
}

