import { Card, Pill } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { LocalTime } from "@/components/local-time";
import type { PracticeSessionView } from "@/lib/practice/data";
import { PracticePoller, PracticeSessionButtons } from "@/components/practice-session-controls";
import { PracticeReviewBody, checklist } from "@/components/practice-review";

// Practice reviews, newest first, each starting closed (title, the
// length line and a fading four-line preview of the summary). Opened: a short summary (up to about five lines), check marks
// for the assigned items and current pieces, an encouraging line, and short
// "Going well" / "Things to work on" lists. The teacher also sees a short
// teacher-only note, and can use the compact layout for a quick glance.

const UPLOAD_STALE_MS = 30 * 60 * 1000;

function uploadStuck(createdAt: string): boolean {
  return Date.now() - Date.parse(createdAt) > UPLOAD_STALE_MS;
}

function minutes(seconds: number): string {
  const m = Math.round(seconds / 60);
  return m < 1 ? "under a minute" : `${m} min`;
}

export function PracticeSessionList({
  sessions,
  teacherView = false,
  compact = false,
  canSwitch = teacherView,
  flat = false,
}: {
  sessions: PracticeSessionView[];
  /** Everything shown at once, no open/close of its own (inside a card that already has Show more). */
  flat?: boolean;
  teacherView?: boolean;
  /** Show "This was a lesson" (needs the teacher's account, also in Family mode). */
  canSwitch?: boolean;
  /** Teacher's quick glance: check marks as a compact row, no item notes. */
  compact?: boolean;
}) {
  if (!sessions.length) return null;
  return (
    <div className={flat ? "flex flex-col gap-4 [&>*+*]:border-t [&>*+*]:border-rule [&>*+*]:pt-4" : "flex flex-col gap-2"}>
      {sessions.map((s) => (
        <SessionCard key={s.id} s={s} teacherView={teacherView} compact={compact} canSwitch={canSwitch} flat={flat} />
      ))}
    </div>
  );
}

function SessionCard({
  s,
  teacherView,
  compact,
  canSwitch,
  flat,
}: {
  s: PracticeSessionView;
  teacherView: boolean;
  compact: boolean;
  canSwitch: boolean;
  flat: boolean;
}) {
  const r = s.review;
  const working = s.status === "transcribing" || s.status === "analyzing";
  const stuckUpload = s.status === "uploading" && uploadStuck(s.created_at);
  const checks = r ? checklist(r, s.titles) : [];
  const done = checks.filter((c) => c.practiced).length;

  // Flat: no frame and no open/close of its own, so the text runs the full
  // width of the card it sits in (a history card that already has Show more).
  if (flat) {
    return (
      <div className="flex flex-col gap-3">
        {working && <PracticePoller id={s.id} />}
        <div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-medium">
                {formatDate(s.practice_date, "weekday")}, <LocalTime iso={s.started_at} />
              </span>
              {s.media === "video" && <Pill>video</Pill>}
              {s.with_helper && <Pill>with a helper</Pill>}
              {(s as { recording_missing?: boolean }).recording_missing && (
                <Pill tone="danger">! no recording</Pill>
              )}
              {s.status === "done" && s.counted === false && <Pill tone="amber">not counted</Pill>}
              {working && <Pill tone="plum">listening…</Pill>}
              {s.status === "uploading" && <Pill>{stuckUpload ? "upload didn't finish" : "sending…"}</Pill>}
              {s.status === "error" && <Pill tone="danger">review didn&apos;t finish</Pill>}
            </div>
            <div className="text-sm text-muted">
              {minutes(s.duration_seconds)} session · {minutes(s.playing_seconds)} playing
              {checks.length > 0 ? ` · ${done} of ${checks.length} checked` : ""}
            </div>
            {r?.summary && (
              // The whole summary: the card around it does the folding.
              <div className="mt-1 text-[16px]">
                {r.summary}
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-col gap-3 text-[16px]">
          {s.status === "error" && <div className="text-sm text-danger">{s.error || "The review didn't finish."}</div>}
          {working && <div className="text-sm text-muted">Listening back to the practice. This takes a minute or two.</div>}
          {r && <PracticeReviewBody review={r} titles={s.titles} compact={compact} teacherView={teacherView} />}
          <PracticeSessionButtons id={s.id} canRetry={s.status === "error"} canRedo={teacherView && s.status === "done" && !!r}
            canSwitch={canSwitch && (s.status === "done" || s.status === "error")}
          />
        </div>
      </div>
    );
  }

  return (
    <Card className="!p-0">
      {working && <PracticePoller id={s.id} />}
      <details className="group">
        <summary className="flex cursor-pointer list-none items-start gap-3 px-4 py-2.5">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-medium">
                {formatDate(s.practice_date, "weekday")}, <LocalTime iso={s.started_at} />
              </span>
              {s.media === "video" && <Pill>video</Pill>}
              {s.with_helper && <Pill>with a helper</Pill>}
              {(s as { recording_missing?: boolean }).recording_missing && (
                <Pill tone="danger">! no recording</Pill>
              )}
              {s.status === "done" && s.counted === false && <Pill tone="amber">not counted</Pill>}
              {working && <Pill tone="plum">listening…</Pill>}
              {s.status === "uploading" && <Pill>{stuckUpload ? "upload didn't finish" : "sending…"}</Pill>}
              {s.status === "error" && <Pill tone="danger">review didn&apos;t finish</Pill>}
            </div>
            <div className="text-sm text-muted">
              {minutes(s.duration_seconds)} session · {minutes(s.playing_seconds)} playing
              {checks.length > 0 ? ` · ${done} of ${checks.length} checked` : ""}
            </div>
            {r?.summary && (
              // Closed: about four lines, fading out. Open: the whole summary.
              <div className="mt-1 line-clamp-4 text-[16px] [mask-image:linear-gradient(to_bottom,black_55%,transparent)] group-open:line-clamp-none group-open:[mask-image:none]">
                {r.summary}
              </div>
            )}
          </div>
          <span className="mt-1 text-muted transition group-open:rotate-90" aria-hidden>
            ›
          </span>
        </summary>

        <div className="flex flex-col gap-3 border-t border-rule px-4 py-3 text-[16px]">
          {s.status === "error" && <div className="text-sm text-danger">{s.error || "The review didn't finish."}</div>}
          {working && <div className="text-sm text-muted">Listening back to the practice. This takes a minute or two.</div>}
          {r && <PracticeReviewBody review={r} titles={s.titles} compact={compact} teacherView={teacherView} />}
          <PracticeSessionButtons id={s.id} canRetry={s.status === "error"} canRedo={teacherView && s.status === "done" && !!r}
            canSwitch={canSwitch && (s.status === "done" || s.status === "error")}
          />
        </div>
      </details>
    </Card>
  );
}
