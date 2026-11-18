import Link from "next/link";
import { Notice } from "@/components/ui";
import { Programs, Reading, Running } from "@/components/craft-view";
import { loadCraft } from "@/lib/craft/data";

// Craft as the last section of Intro: the running Focus program, the
// programs and reading (first of each, then Show more). The numbers live on
// the Analytics page, linked from here. Teacher-only;
// nothing here reaches families.
export async function CraftSection({ teacherId }: { teacherId: string }) {
  const { ready, run, measure } = await loadCraft(teacherId);
  return (
    <section id="craft" className="flex scroll-mt-28 flex-col gap-9 border-t border-rule pt-7">
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-[12px] font-semibold uppercase tracking-[0.12em] text-accent-ink">
            For you, not your families
          </div>
          <h2 className="font-display text-3xl font-semibold">Craft</h2>
        </div>
        <Link href="/analytics" className="pb-1 text-[15px] font-medium text-accent-ink no-underline">
          Analytics ›
        </Link>
      </div>
      {!ready && (
        <Notice>
          Focus programs need a one-time database step: run <strong>admin/craft.sql</strong> in the Supabase SQL Editor.
          Reading and Analytics work already.
        </Notice>
      )}
      {run && measure && <Running run={run} measure={measure} />}
      <Programs running={run?.program.slug ?? null} ready={ready} />
      <Reading />
    </section>
  );
}
