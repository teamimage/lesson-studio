import { Suspense } from "react";
import { Shell } from "@/components/shell";
import { Me } from "@/components/v3/me";
import { Notice } from "@/components/ui";
import { Numbers, Programs, Reading, Running } from "@/components/craft-view";
import { requireTeacher } from "@/lib/auth";
import { loadCraft } from "@/lib/craft/data";

// Craft: the teacher's own improvement section. A running Focus program
// first (today's short read, one thing to try, a one-tap check-in, and the
// number from recorded lessons), then the programs, the teacher's lessons in
// numbers, and reading. Teacher-only; nothing here reaches families.
export default function CraftPage() {
  return (
    <Shell title="Craft" eyebrow="For you, not your families" tab="downbeat" me={<Me />}>
      <Suspense fallback={<div className="h-60 animate-pulse rounded-2xl bg-sheet" />}>
        <Body />
      </Suspense>
    </Shell>
  );
}

async function Body() {
  const { teacher } = await requireTeacher();
  const { ready, run, lessons, measure } = await loadCraft(teacher.id);

  return (
    <div className="flex flex-col gap-9">
      {!ready && (
        <Notice>
          Focus programs need a one-time database step: run <strong>admin/craft.sql</strong> in the Supabase SQL Editor.
          Reading and your numbers work already.
        </Notice>
      )}
      {run && measure && <Running run={run} measure={measure} />}
      <Programs running={run?.program.slug ?? null} ready={ready} />
      <Numbers lessons={lessons} />
      <Reading />
    </div>
  );
}

