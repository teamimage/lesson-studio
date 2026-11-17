import { Card } from "@/components/ui";
import { InstrumentTag } from "@/components/instrument-tag";
import { formatDate } from "@/lib/format";
import { channelReady } from "@/lib/overview/send";
import { ACTIVITY_WORD, formatMoney, type OverviewData } from "@/lib/overview/types";
import { BalanceEdit, ContactDetailsLink, ContactRow, HistoryLink, YearsEdit } from "./student-overview-parts";

// The overview box at the top of the teacher's student page. Left: name and
// instrument, years playing, parents, Contact buttons, communication
// history, balance. Right (below on a phone): current repertoire from the
// last two lessons. Teacher only: the family's pages never show it.

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
    <Card className="grid gap-4 sm:grid-cols-2 sm:gap-6">
      <div className="flex min-w-0 flex-col gap-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-display text-[22px] font-semibold leading-tight">{name}</h2>
          <InstrumentTag instrument={instrument} />
        </div>
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
      </div>

      <div className="flex min-w-0 flex-col gap-1.5 border-t border-rule pt-3 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-6">
        <h3 className="font-display text-[18px] font-semibold">Current repertoire</h3>
        {data.repertoire.length === 0 ? (
          <p className="text-[16px] text-muted">No pieces listed in the last two lessons.</p>
        ) : (
          <ul className="flex flex-col">
            {data.repertoire.map((r) => (
              <li key={r.title} className="flex items-baseline gap-2 py-1 text-[16px]">
                <span className="min-w-0 flex-1">{r.title}</span>
                <span className="shrink-0 text-[13px] text-muted">
                  {ACTIVITY_WORD[r.activity] ?? r.activity}
                  {r.lessons === 2 ? " · both lessons" : r.latest ? "" : " · lesson before"}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="text-[13px] text-muted">From the last two lessons.</p>
      </div>
    </Card>
  );
}
