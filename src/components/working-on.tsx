import { Card, Pill, cx } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { markFocus } from "@/app/students/focus-actions";
import type { WorkingOn } from "@/lib/focus/data";
import { MAX_FOCUS, STATUS_WORDS, STUCK_AT, type FocusItem, type FocusStatus } from "@/lib/focus/types";
import { AcceptFocusForm, AddFocusForm, EditFocusForm, SuggestFocusForm } from "./working-on-forms";

// "What we're working on": the short lasting list at the top of a student's
// page. At most three focus points, each with one word for how it is going,
// and one line telling the parent what to listen for. The family sees the
// list; the teacher also sees the app's suggestions (nothing joins the list
// until she accepts it), can reword, park or finish a point, and is told
// when one hasn't moved in four practices. "Stuck" never shows to a family.

const TONE: Record<FocusStatus, "muted" | "sage" | "amber"> = {
  working: "muted",
  better: "sage",
  went_back: "amber",
  done: "sage",
};

function Mark({ id, studentId, what, children }: { id: string; studentId: string; what: string; children: string }) {
  return (
    <form action={markFocus}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="student_id" value={studentId} />
      <input type="hidden" name="what" value={what} />
      <button className="min-h-10 rounded-full border border-rule bg-sheet px-3 text-sm font-medium hover:border-accent/50">{children}</button>
    </form>
  );
}

function Point({ item, teacherView }: { item: FocusItem; teacherView: boolean }) {
  return (
    <li className="flex flex-col gap-1 py-2.5">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        {/* Accepted and shared with the family, with nothing heard about it yet. */}
        {teacherView && item.status === "working" && !item.lastHeardOn ? (
          <Pill tone="plum" className="text-[13px]">
            Sent
          </Pill>
        ) : (
          <Pill tone={TONE[item.status]} className="text-[13px]">
            {STATUS_WORDS[item.status]}
          </Pill>
        )}
        <span className="text-[17px] font-medium">{item.title}</span>
        {item.piece && <span className="text-sm text-muted">{item.piece}</span>}
      </div>
      {teacherView && item.stuck && (
        <p className="text-sm text-accent-ink">
          No change in {item.sameRun >= STUCK_AT ? item.sameRun : STUCK_AT} practices in a row. Your rule: change something.
        </p>
      )}
      {teacherView && item.lastNote && <p className="text-sm text-muted">Last heard: {item.lastNote}</p>}
      {teacherView && (
        <details className="group">
          <summary className="cursor-pointer list-none text-sm text-accent-ink underline [&::-webkit-details-marker]:hidden">Change</summary>
          <div className="mt-2 flex flex-col gap-2">
            <div className="flex flex-wrap gap-1.5">
              <Mark id={item.id} studentId={item.student_id} what="better">Better</Mark>
              <Mark id={item.id} studentId={item.student_id} what="same">Still working</Mark>
              <Mark id={item.id} studentId={item.student_id} what="went_back">Went back</Mark>
              <Mark id={item.id} studentId={item.student_id} what="park">Park it</Mark>
              <Mark id={item.id} studentId={item.student_id} what="done">Done</Mark>
            </div>
            <EditFocusForm id={item.id} studentId={item.student_id} title={item.title} cue={item.parent_cue} />
          </div>
        </details>
      )}
    </li>
  );
}

export function WorkingOnCard({
  data,
  studentId,
  teacherView = false,
  hasApprovedLesson = false,
}: {
  data: WorkingOn;
  studentId: string;
  teacherView?: boolean;
  /** Teacher view: whether there is a lesson to suggest from. */
  hasApprovedLesson?: boolean;
}) {
  if (!data.ready) return null;
  if (!teacherView && data.open.length === 0) return null;
  const cue = data.open.find((o) => o.parent_cue)?.parent_cue;
  const room = MAX_FOCUS - data.open.length;

  const heading = <h2 className="font-display text-[20px] font-semibold">What we&apos;re working on</h2>;
  const body = (
    <>

      {data.open.length > 0 ? (
        <ul className="flex flex-col divide-y divide-rule">
          {data.open.map((item) => (
            <Point key={item.id} item={item} teacherView={teacherView} />
          ))}
        </ul>
      ) : (
        <p className="py-1 text-[16px] text-muted">
          Nothing on the list yet. It holds up to three things you most want to hear change, so the family knows what the practice is for.
        </p>
      )}

      {cue && (
        <p className="text-[16px]">
          <span className="font-semibold text-plum">Parent: </span>
          {cue}
        </p>
      )}
      {data.watching.length > 0 && (
        <p className={cx("text-sm text-muted", cue && "mt-1")}>Still watching: {data.watching.map((w) => w.title).join(" · ")}</p>
      )}

      {teacherView && data.watching.length > 0 && room > 0 && (
        <details>
          <summary className="cursor-pointer list-none text-sm text-accent-ink underline [&::-webkit-details-marker]:hidden">
            Bring one back
          </summary>
          <ul className="mt-2 flex flex-col gap-3">
            {data.watching.map((w) => (
              <li key={w.id}>
                <AcceptFocusForm id={w.id} studentId={studentId} title={w.title} cue={w.parent_cue}>
                  <Mark id={w.id} studentId={studentId} what="done">Done</Mark>
                </AcceptFocusForm>
              </li>
            ))}
          </ul>
        </details>
      )}

      {teacherView && data.proposed.length > 0 && (
        <div className="mt-2 flex flex-col gap-2 border-t border-rule pt-3">
          <h3 className="font-display text-[18px] font-semibold">Suggestions from the teacher</h3>
          <p className="text-sm text-muted">
            Taken from the last lesson. Nothing here is on the list, or shown to the family, until you accept it.
          </p>
          <ul className="flex flex-col divide-y divide-rule">
            {data.proposed.map((p) => (
              <li key={p.id} className="py-3 last:pb-0">
                <AcceptFocusForm id={p.id} studentId={studentId} title={p.title} cue={p.parent_cue}>
                  <Mark id={p.id} studentId={studentId} what="dismiss">Not this</Mark>
                </AcceptFocusForm>
              </li>
            ))}
          </ul>
        </div>
      )}

      {teacherView && (
        <div className="mt-2 flex flex-col gap-2 border-t border-rule pt-3">
          {room > 0 && (
            <details>
              <summary className="cursor-pointer list-none text-sm text-accent-ink underline [&::-webkit-details-marker]:hidden">
                Add your own
              </summary>
              <div className="mt-2">
                <AddFocusForm studentId={studentId} />
              </div>
            </details>
          )}
          {hasApprovedLesson && data.proposed.length === 0 && (
            <SuggestFocusForm studentId={studentId} label={data.open.length ? "Suggest again from the last lesson" : "Suggest from the last lesson"} />
          )}
        </div>
      )}
    </>
  );

  // The family always sees the list open. For the teacher the whole card
  // folds: open while suggestions wait for an answer, closed once each has
  // one (and whenever there are none), to be opened by hand.
  if (!teacherView)
    return (
      <Card className="flex flex-col gap-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          {heading}
          {data.lessonDate && <span className="text-sm text-muted">from the {formatDate(data.lessonDate)} lesson</span>}
        </div>
        {body}
      </Card>
    );
  const waiting = data.proposed.length;
  return (
    <div className="rounded-2xl border border-rule bg-sheet shadow-[0_1px_0_rgba(43,37,33,0.04)]">
      <details key={waiting > 0 ? "waiting" : "decided"} open={waiting > 0} className="group">
        <summary className="flex min-h-12 cursor-pointer list-none flex-wrap items-center gap-x-3 px-4 py-2 [&::-webkit-details-marker]:hidden">
          {heading}
          <span className={cx("text-sm", waiting ? "font-medium text-accent-ink" : "text-muted")}>
            {waiting
              ? `${waiting} suggestion${waiting === 1 ? "" : "s"} to decide`
              : data.open.length
                ? `${data.open.length} on the list`
                : "nothing on the list yet"}
          </span>
          <span aria-hidden className="ml-auto text-xl text-muted transition-transform group-open:rotate-90">
            ›
          </span>
        </summary>
        <div className="flex flex-col gap-1 px-4 pb-4">
          {data.lessonDate && <span className="text-sm text-muted">from the {formatDate(data.lessonDate)} lesson</span>}
          {body}
        </div>
      </details>
    </div>
  );
}
