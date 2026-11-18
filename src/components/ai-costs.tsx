import "server-only";
import Link from "next/link";
import { Card, SectionTitle } from "@/components/ui";
import { getUsageSummary } from "@/lib/ai/usage";
import { formatUsd } from "@/lib/ai/pricing";
import { formatDate } from "@/lib/format";
import { createAdminClient } from "@/lib/supabase/admin";

function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}

// Running totals of what the AI has cost: lesson videos (transcription +
// Claude) and reading uploaded sheet music.
export async function AiCosts({ teacherId, title = "AI costs", admin = false }: { teacherId: string; title?: string; admin?: boolean }) {
  const db = admin ? await createAdminClient() : undefined;
  const usage = await getUsageSummary(teacherId, db);
  return (
    <section className="scroll-mt-6">
      <SectionTitle>{title}</SectionTitle>
      <Card className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-[12px] font-semibold uppercase tracking-[0.12em] text-muted">This month</div>
            <div className="font-display text-2xl">{formatUsd(usage.thisMonthUsd)}</div>
          </div>
          <div>
            <div className="text-[12px] font-semibold uppercase tracking-[0.12em] text-muted">All time</div>
            <div className="font-display text-2xl">{formatUsd(usage.allTimeUsd)}</div>
          </div>
        </div>
        {usage.lessons.length === 0 ? (
          <p className="text-sm text-muted">
            Nothing yet. Costs show up here after a lesson video is processed, sheet music is read or a practice session is reviewed.
          </p>
        ) : (
          <>
            <div>
              <div className="mb-1 text-sm font-semibold">By month</div>
              <ul className="divide-y divide-rule text-sm">
                {usage.months.map((m) => (
                  <li key={m.month} className="flex justify-between py-1.5">
                    <span>{monthLabel(m.month)}</span>
                    <span className="tabular-nums">{formatUsd(m.costUsd)}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="mb-1 text-sm font-semibold">By lesson, music and practice</div>
              <ul className="divide-y divide-rule text-sm">
                {usage.lessons.slice(0, 30).map((l) => (
                  <li
                    key={l.key}
                    className="flex items-baseline justify-between gap-3 py-1.5"
                  >
                    <span className="min-w-0">
                      {l.assistant ? (
                        <span className="font-medium">Teaching assistant</span>
                      ) : l.practice ? (
                        <span className="font-medium">
                          Practice reviews{l.studentName ? `: ${l.studentName}` : " (deleted sessions)"}
                        </span>
                      ) : l.music ? (
                        l.scoreTitle ? (
                          <span className="font-medium">
                            Sheet music: {l.scoreTitle}
                            {l.studentName ? ` (${l.studentName})` : ""}
                          </span>
                        ) : (
                          <span className="text-muted">Deleted sheet music</span>
                        )
                      ) : l.lessonId ? (
                        <Link href={`/lessons/${l.lessonId}`} className="font-medium text-accent-ink">
                          {l.studentName ?? "Lesson"}
                          {l.lessonDate ? `, ${formatDate(l.lessonDate)}` : ""}
                        </Link>
                      ) : (
                        <span className="text-muted">Deleted lessons</span>
                      )}
                      <span className="block text-xs text-muted">
                        {l.audioMinutes > 0 ? `${Math.round(l.audioMinutes)} min transcribed ${formatUsd(l.transcriptionUsd)} · ` : ""}
                        Claude {formatUsd(l.claudeUsd)}
                      </span>
                    </span>
                    <span className="tabular-nums">{formatUsd(l.costUsd)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </Card>
    </section>
  );
}
