import { Card, Pill, cx } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { LocalTime } from "@/components/local-time";
import type { PracticeSessionView } from "@/lib/practice/data";
import { PracticePoller, PracticeSessionButtons } from "@/components/practice-session-controls";

// Practice reviews, newest first. The family sees what was practised, the
// time, a gentle note on how the practice flowed and tips; the teacher also
// sees a short teacher-only note.

const UPLOAD_STALE_MS = 30 * 60 * 1000;

function uploadStuck(createdAt: string): boolean {
  return Date.now() - Date.parse(createdAt) > UPLOAD_STALE_MS;
}

function minutes(seconds: number): string {
  const m = Math.round(seconds / 60);
  return m < 1 ? "under a minute" : `${m} min`;
}

export function PracticeSessionList({ sessions, teacherView = false }: { sessions: PracticeSessionView[]; teacherView?: boolean }) {
  if (!sessions.length) return null;
  return (
    <div className="flex flex-col gap-2">
      {sessions.map((s, i) => (
        <SessionCard key={s.id} s={s} teacherView={teacherView} open={i === 0} />
      ))}
    </div>
  );
}

function SessionCard({ s, teacherView, open }: { s: PracticeSessionView; teacherView: boolean; open: boolean }) {
  const r = s.review;
  const working = s.status === "transcribing" || s.status === "analyzing";
  const stuckUpload = s.status === "uploading" && uploadStuck(s.created_at);
  const practiced = (r?.items ?? []).filter((i) => i.practiced);
  const skipped = (r?.items ?? []).filter((i) => !i.practiced);

  return (
    <Card className="p-0">
      {working && <PracticePoller id={s.id} />}
      <details open={open && s.status === "done"} className="group">
        <summary className="flex cursor-pointer list-none items-start gap-3 px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-medium">
                {formatDate(s.practice_date, "weekday")}, <LocalTime iso={s.started_at} />
              </span>
              {s.media === "video" && <Pill>video</Pill>}
              {s.status === "done" && s.counted === false && <Pill tone="amber">not counted</Pill>}
              {working && <Pill tone="plum">listening…</Pill>}
              {s.status === "uploading" && <Pill>{stuckUpload ? "upload didn't finish" : "sending…"}</Pill>}
              {s.status === "error" && <Pill tone="danger">review didn&apos;t finish</Pill>}
            </div>
            <div className="text-sm text-muted">
              {minutes(s.duration_seconds)} session · {minutes(s.playing_seconds)} playing
              {r && practiced.length + skipped.length > 0 ? ` · ${practiced.length} of ${practiced.length + skipped.length} items` : ""}
            </div>
            {r?.summary && <div className="mt-1 text-[15px]">{r.summary}</div>}
          </div>
          <span className="mt-1 text-muted transition group-open:rotate-90" aria-hidden>
            ›
          </span>
        </summary>

        <div className="flex flex-col gap-3 border-t border-rule px-4 py-3 text-[15px]">
          {s.status === "error" && <div className="text-sm text-danger">{s.error || "The review didn't finish."}</div>}
          {working && <div className="text-sm text-muted">Listening back to the practice. This takes a minute or two.</div>}

          {r && (
            <>
              {r.counted === false && r.not_counted_reason && (
                <div className="rounded-xl bg-amber-soft px-3 py-2 text-sm">{r.not_counted_reason}</div>
              )}
              {(practiced.length > 0 || skipped.length > 0) && (
                <ul className="flex flex-col gap-1.5">
                  {[...practiced, ...skipped].map((it) => (
                    <li key={it.assignment_id} className="flex items-start gap-2">
                      <span
                        className={cx(
                          "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs",
                          it.practiced ? "bg-sage text-white" : "border border-rule",
                        )}
                        aria-label={it.practiced ? "practised" : "not heard"}
                      >
                        {it.practiced ? "✓" : ""}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="font-medium">{s.titles[it.assignment_id] ?? "Assignment"}</span>
                        {it.practiced && it.minutes > 0 && <span className="text-muted"> · {Math.round(it.minutes)} min</span>}
                        {it.practiced && it.confidence === "low" && <span className="text-muted"> · maybe</span>}
                        {it.note && <span className="block text-sm text-muted">{it.note}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {r.other.length > 0 && (
                <div className="text-sm">
                  <span className="text-muted">Also played: </span>
                  {r.other.map((o) => `${o.label}${o.minutes ? ` (${Math.round(o.minutes)} min)` : ""}`).join(", ")}
                </div>
              )}
              {r.flow && (
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-plum">How it flowed</div>
                  <div>{r.flow}</div>
                </div>
              )}
              {r.tips.length > 0 && (
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-plum">For next time</div>
                  <ul className="list-disc pl-5">
                    {r.tips.map((t, i) => (
                      <li key={i}>{t}</li>
                    ))}
                  </ul>
                </div>
              )}
              {r.timeline.length > 0 && (
                <details className="text-sm">
                  <summary className="cursor-pointer text-accent-ink">Session timeline</summary>
                  <ol className="mt-1 flex flex-col gap-0.5">
                    {r.timeline.map((t, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="w-24 shrink-0 font-mono text-xs leading-5 text-muted">
                          {t.start}–{t.end}
                        </span>
                        <span>{t.label}</span>
                      </li>
                    ))}
                  </ol>
                </details>
              )}
              {teacherView && r.teacher_note && (
                <div className="rounded-xl bg-accent-soft px-3 py-2 text-sm">
                  <span className="font-medium text-accent-ink">Teacher only: </span>
                  {r.teacher_note}
                </div>
              )}
            </>
          )}
          <PracticeSessionButtons id={s.id} canRetry={s.status === "error"} />
        </div>
      </details>
    </Card>
  );
}
