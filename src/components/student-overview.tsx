import type { ReactNode } from "react";
import { Card } from "@/components/ui";
import { InstrumentTag } from "@/components/instrument-tag";
import { formatDate } from "@/lib/format";
import { channelReady } from "@/lib/overview/send";
import { ACTIVITY_WORD, formatMoney, type OverviewData } from "@/lib/overview/types";
import { BalanceEdit, ContactDetailsLink, ContactRow, HistoryLink, YearsEdit } from "./student-overview-parts";

/** A box whose title bar folds it open and shut (same look as "What we're working on"). */
function Fold({ title, meta, open, children }: { title: string; meta?: string; open?: boolean; children: ReactNode }) {
  return (
    <details open={open} className="group/fold rounded-2xl border border-rule bg-sheet shadow-[0_1px_0_rgba(43,37,33,0.04)]">
      <summary className="flex min-h-12 cursor-pointer list-none flex-wrap items-center gap-x-3 px-4 py-2 [&::-webkit-details-marker]:hidden">
        <h2 className="font-display text-[20px] font-semibold">{title}</h2>
        {meta && <span className="text-sm text-muted">{meta}</span>}
        <span aria-hidden className="ml-auto text-xl text-muted transition-transform group-open/fold:rotate-90">
          ›
        </span>
      </summary>
      <div className="flex flex-col gap-2.5 px-4 pb-4">{children}</div>
    </details>
  );
}

// The overview at the top of the teacher's student page, as three boxes:
// name and instrument; "Student info" (folded: years playing, parents,
// Contact buttons, communication history, balance); "Current repertoire"
// (open, can be folded): pieces, scales and arpeggios, etudes, exercises and
// listening from the last two lessons. Teacher only: the family's pages never show it.

export function StudentOverview({
  studentId,
  name,
  instrument,
  data,
  year,
}: {
  /** This year in the studio's time zone. */
  year: number;
  studentId: string;
  name: string;
  instrument: string;
  data: OverviewData;
}) {
  const years = data.playingSince === null ? null : Math.max(0, year - data.playingSince);
  const parents = data.contacts.filter((c) => c.role === "parent");
  const off = !data.ready;
  const cents = data.balanceCents;
  const repertoireCount = data.repertoire.reduce((n, g) => n + g.items.length, 0);
  // One short line on the folded "Student info" bar.
  const summary = [
    years === null ? null : `${years} yr${years === 1 ? "" : "s"}`,
    cents && cents > 0 ? `${formatMoney(cents)} due` : null,
    data.messages.length ? `${data.messages.length} message${data.messages.length === 1 ? "" : "s"}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const balanceView = (
    <span className="text-[16px]">
      {cents === null || cents === 0 ? (
        <>
          <span className="font-semibold">Balance</span> <span className="text-muted">{cents === 0 ? "$0.00, all paid" : "not recorded"}</span>
        </>
      ) : cents > 0 ? (
        <>
          <span className="font-semibold">Balance due</span> <span className="font-semibold text-accent-ink">{formatMoney(cents)}</span>
        </>
      ) : (
        <>
          <span className="font-semibold">Credit</span> <span className="font-semibold text-sage">{formatMoney(-cents)}</span>
        </>
      )}
      {data.balanceNote && <span className="text-muted"> · {data.balanceNote}</span>}
      {data.balanceUpdatedAt && cents !== null && (
        <span className="text-sm text-muted"> · updated {formatDate(data.balanceUpdatedAt.slice(0, 10))}</span>
      )}
    </span>
  );

  return (
    <div className="flex flex-col gap-3">
      <Card className="flex flex-wrap items-center gap-2 py-3">
        <h2 className="font-display text-[22px] font-semibold leading-tight">{name}</h2>
        <InstrumentTag instrument={instrument} />
      </Card>

      <Fold title="Student info" meta={off ? undefined : summary}>
        <YearsEdit studentId={studentId} years={years} since={data.playingSince} disabled={off} />
        <p className="text-[16px]">
          {parents.length === 0 ? (
            <span className="text-muted">No parents added yet</span>
          ) : (
            <>
              <span className="text-muted">Parent{parents.length === 1 ? "" : "s"}: </span>
              {parents.map((p) => p.first).join(" and ")}
            </>
          )}
        </p>
        <ContactRow studentId={studentId} contacts={data.contacts} ready={channelReady()} disabled={off} />
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <HistoryLink messages={data.messages} studentFirst={name.split(" ")[0]} disabled={off} />
          <ContactDetailsLink studentId={studentId} contacts={data.contacts} disabled={off} />
        </div>
        <BalanceEdit
          studentId={studentId}
          amount={cents === null ? "" : (cents / 100).toFixed(2)}
          note={data.balanceNote}
          view={balanceView}
          disabled={off}
        />
        {off && (
          <p className="text-sm text-amber">Run student-overview.sql in Supabase to turn on editing, messages and the balance.</p>
        )}
      </Fold>

      <Fold title="Current repertoire" meta={repertoireCount ? `${repertoireCount} item${repertoireCount === 1 ? "" : "s"}` : undefined} open>
        {data.repertoire.length === 0 ? (
          <p className="text-[16px] text-muted">Nothing listed or assigned in the last two lessons.</p>
        ) : (
          data.repertoire.map((g) => (
            <div key={g.key} className="flex flex-col">
              <h3 className="text-[15px] font-semibold">{g.label}</h3>
              <ul className="flex flex-col pl-3">
                {g.items.map((r) => (
                  <li key={r.title} className="flex items-baseline gap-2 py-0.5 text-[16px]">
                    <span className="min-w-0 flex-1">{r.title}</span>
                    <span className="shrink-0 text-[13px] text-muted">
                      {[r.activity ? (ACTIVITY_WORD[r.activity] ?? r.activity) : null, r.lessons === 2 ? "both lessons" : r.latest ? null : "lesson before"]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
        <p className="text-[13px] text-muted">Everything played or assigned in the last two lessons.</p>
      </Fold>
    </div>
  );
}
