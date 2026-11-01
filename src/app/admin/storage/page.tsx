import { Suspense } from "react";
import Link from "next/link";
import { Shell } from "@/components/shell";
import { ConfirmButton } from "@/components/confirm-button";
import { Card, Notice, Pill, SectionTitle } from "@/components/ui";
import { VideoCleanup, type CleanupVideo } from "@/components/video-cleanup";
import { requireAdmin } from "@/lib/admin";
import { formatBytes, formatDate } from "@/lib/format";
import { adminPurgeVideos } from "../actions";

/** Supabase Pro includes 100 GB of file storage per organization. */
const INCLUDED_BYTES = 100 * 1024 ** 3;
/** Supabase's price past the included amount, per GB per month. */
const OVERAGE_PER_GB = 0.0213;
const BUCKET_NAMES: Record<string, string> = {
  "lesson-recordings": "Lesson videos",
  "lesson-scores": "Sheet music pages",
};

type SP = Promise<{ deleted?: string; error?: string }>;

export default function StoragePage({ searchParams }: { searchParams: SP }) {
  return (
    <Shell title="Storage" eyebrow="Admin" back={{ href: "/admin", label: "Admin" }} wide>
      <Suspense>
        <Body searchParams={searchParams} />
      </Suspense>
    </Shell>
  );
}

async function Body({ searchParams }: { searchParams: SP }) {
  const { db } = await requireAdmin();
  const sp = await searchParams;
  const [usage, loose, { data: recs }, { data: students }, { data: lessons }] = await Promise.all([
    db.rpc("admin_storage_usage"),
    db.rpc("admin_unlinked_videos"),
    db.from("recordings").select("*").eq("status", "ready").order("created_at"),
    db.from("students").select("id, name"),
    db.from("lessons").select("id, lesson_date"),
  ]);
  const needsSql = !!usage.error || !!loose.error;
  const studentName = new Map((students ?? []).map((s) => [s.id, s.name]));
  const lessonDate = new Map((lessons ?? []).map((l) => [l.id, l.lesson_date]));

  const buckets = usage.data ?? [];
  const used = buckets.reduce((n, b) => n + Number(b.bytes), 0);
  const pct = Math.min(100, (used / INCLUDED_BYTES) * 100);
  const over = Math.max(0, used - INCLUDED_BYTES);

  const archived = (recs ?? []).filter((r) => r.archived_at);
  const archivedBytes = archived.reduce((n, r) => n + Number(r.size_bytes), 0);

  const videos: CleanupVideo[] = [
    ...(recs ?? []).map((r) => {
      const date = lessonDate.get(r.lesson_id) ?? null;
      return {
        key: r.id,
        kind: "recording" as const,
        name: r.label || r.file_name,
        student: studentName.get(r.student_id) ?? null,
        lessonDate: date ? formatDate(date, "short") : null,
        bytes: Number(r.size_bytes),
        state: r.archived_at ? ("archived" as const) : ("active" as const),
        date: date ?? r.created_at.slice(0, 10),
      };
    }),
    ...(loose.data ?? []).map((f) => ({
      key: f.name,
      kind: "loose" as const,
      name: f.name.split("/").pop() || f.name,
      student: studentName.get(f.name.split("/")[1] ?? "") ?? null,
      lessonDate: null,
      bytes: Number(f.bytes),
      state: "loose" as const,
      date: f.created_at.slice(0, 10),
    })),
  ];

  return (
    <div className="flex flex-col gap-8">
      {sp.deleted && (
        <Notice tone="sage">
          Deleted {sp.deleted} file{sp.deleted === "1" ? "" : "s"} for good.
        </Notice>
      )}
      {sp.error === "none" && <Notice tone="amber">Nothing was selected.</Notice>}
      {sp.error === "1" && <Notice tone="danger">Some files couldn&apos;t be deleted. Try again.</Notice>}
      {needsSql && (
        <Notice tone="amber">
          Run archived-videos.sql in the Supabase SQL Editor to see storage totals and files left over from
          deleted lessons.
        </Notice>
      )}

      <section>
        <SectionTitle>Space used</SectionTitle>
        <Card className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-display text-3xl">{formatBytes(used || 0)}</span>
            <span className="text-muted">of {formatBytes(INCLUDED_BYTES)} included with Supabase Pro</span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-rule/60" role="img" aria-label={`${Math.round(pct)}% used`}>
            <div
              className={pct >= 90 ? "h-full bg-danger" : pct >= 75 ? "h-full bg-amber" : "h-full bg-sage"}
              style={{ width: `${Math.max(pct, used ? 1 : 0)}%` }}
            />
          </div>
          <ul className="flex flex-col gap-1 text-sm">
            {buckets.map((b) => (
              <li key={b.bucket_id} className="flex justify-between gap-3">
                <span>
                  {BUCKET_NAMES[b.bucket_id] ?? b.bucket_id}{" "}
                  <span className="text-muted">
                    · {b.files} file{Number(b.files) === 1 ? "" : "s"}
                  </span>
                </span>
                <span className="tabular-nums">{formatBytes(Number(b.bytes))}</span>
              </li>
            ))}
            {archived.length > 0 && (
              <li className="flex justify-between gap-3 text-muted">
                <span>of which deleted from lessons (originals kept)</span>
                <span className="tabular-nums">{formatBytes(archivedBytes)}</span>
              </li>
            )}
          </ul>
          {over > 0 && (
            <p className="text-sm text-danger">
              {formatBytes(over)} over the included amount, about $
              {((over / 1024 ** 3) * OVERAGE_PER_GB).toFixed(2)} a month if the Spend Cap is off.
            </p>
          )}
        </Card>
      </section>

      <section>
        <SectionTitle>Need more space?</SectionTitle>
        <Card tone="accent" className="flex flex-col gap-2 text-sm leading-relaxed">
          <p>
            There&apos;s nothing to buy ahead of time. Supabase Pro includes 100 GB of file storage, and past that it
            charges about 2 cents per GB a month (another 100 GB is roughly $2.13 a month), but only when the
            organization&apos;s <strong>Spend Cap</strong> is off. With the Spend Cap on, Supabase emails a warning
            and may restrict the project once it goes over.
          </p>
          <p>
            Supabase has no API for changing this, so it can&apos;t be automated from here. Turn the Spend Cap off
            once in billing, or delete old videos below.
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <a
              href="https://supabase.com/dashboard/org/_/billing"
              target="_blank"
              rel="noreferrer"
              className="font-medium text-accent-ink underline"
            >
              Supabase billing (Spend Cap)
            </a>
            <a
              href="https://supabase.com/dashboard/org/_/usage"
              target="_blank"
              rel="noreferrer"
              className="font-medium text-accent-ink underline"
            >
              Supabase usage
            </a>
          </div>
        </Card>
      </section>

      <section>
        <SectionTitle>Deleted from lessons</SectionTitle>
        <p className="mb-3 text-sm text-muted">
          Videos a teacher deleted from a lesson. The streaming copy is gone, the original is kept here. Open the
          lesson to restore one, or delete it for good.
        </p>
        <div className="flex flex-col gap-2">
          {archived.map((r) => (
            <Card key={r.id} className="flex flex-wrap items-center gap-3 py-3">
              <div className="min-w-0 flex-1 text-sm">
                <div className="break-all font-medium">{r.label || r.file_name}</div>
                <div className="text-muted">
                  {[
                    studentName.get(r.student_id),
                    lessonDate.get(r.lesson_id) ? `lesson ${formatDate(lessonDate.get(r.lesson_id)!, "short")}` : null,
                    formatBytes(Number(r.size_bytes)),
                    r.archived_at ? `deleted ${formatDate(r.archived_at.slice(0, 10), "short")}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              </div>
              <Link href={`/lessons/${r.lesson_id}#recordings`} className="text-sm text-accent-ink underline">
                Open lesson
              </Link>
              <form action={adminPurgeVideos}>
                <input type="hidden" name="recording_id" value={r.id} />
                <ConfirmButton
                  variant="danger"
                  className="min-h-9 px-3 text-sm"
                  message={`Delete ${r.label || r.file_name} (${formatBytes(Number(r.size_bytes))}) for good?\n\nThe original file and its transcript are removed. It can't be restored after this.`}
                >
                  Delete for good
                </ConfirmButton>
              </form>
            </Card>
          ))}
          {archived.length === 0 && <p className="text-sm text-muted">None.</p>}
        </div>
      </section>

      <section>
        <SectionTitle>Free up space</SectionTitle>
        <p className="mb-3 text-sm text-muted">
          Every stored lesson video, oldest first. <Pill tone="plum">No lesson</Pill> means the lesson was deleted
          but the file stayed.
        </p>
        <VideoCleanup videos={videos} />
      </section>
    </div>
  );
}
