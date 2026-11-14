import { Suspense } from "react";
import { Shell } from "@/components/shell";
import { PrintButton } from "@/components/print-button";
import { requireTeacher } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { loadPlaybook } from "@/lib/playbook/data";
import { KIND_WORDS, type CardKind } from "@/lib/playbook/types";

// The kept playbook as one plain page: the teacher's own record of how they
// teach, to copy, print or take with them.

export default function PlaybookPage() {
  return (
    <Suspense fallback={<Shell title="Your playbook" tab="settings">{null}</Shell>}>
      <Body />
    </Suspense>
  );
}

const ORDER: CardKind[] = ["rule", "cue", "word"];

async function Body() {
  const { teacher } = await requireTeacher();
  const { kept } = await loadPlaybook(teacher.id);
  return (
    <Shell title="Your playbook" back={{ href: "/settings/assistant#playbook", label: "Teaching assistant" }} tab="settings">
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
          <p className="text-sm text-muted">Drawn from your own lessons and kept by you. It is yours to copy or print.</p>
          <PrintButton />
        </div>
        {kept.length === 0 && <p className="text-[16px] text-muted">Nothing kept yet.</p>}
        {ORDER.map((kind) => {
          const rows = kept.filter((c) => c.kind === kind);
          if (!rows.length) return null;
          return (
            <section key={kind}>
              <h2 className="mb-2 font-display text-[20px] font-semibold">{KIND_WORDS[kind]}</h2>
              <ul className="flex flex-col gap-2 text-[17px]">
                {rows.map((c) => (
                  <li key={c.id}>
                    {c.body}
                    <span className="text-sm text-muted">
                      {c.instrument ? ` · ${c.instrument}` : ""}
                      {c.last_heard_on ? ` · last heard ${formatDate(c.last_heard_on)}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </Shell>
  );
}
