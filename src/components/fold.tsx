import type { ReactNode } from "react";

// A section that opens and closes in place (proposed version): the title row
// stays visible, the content expands underneath. No new page.
export function Fold({
  id,
  title,
  meta,
  open,
  children,
}: {
  id?: string;
  title: ReactNode;
  meta?: ReactNode;
  open?: boolean;
  children: ReactNode;
}) {
  return (
    <details id={id} open={open} className="group scroll-mt-28 rounded-2xl border border-rule bg-sheet/60">
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-3 px-4 py-2 [&::-webkit-details-marker]:hidden">
        <span className="font-display text-[19px] font-semibold">{title}</span>
        {meta && <span className="text-sm text-muted">{meta}</span>}
        <span aria-hidden className="ml-auto text-xl text-muted transition-transform group-open:rotate-90">
          ›
        </span>
      </summary>
      <div className="flex flex-col gap-4 border-t border-rule px-4 pb-4 pt-3">{children}</div>
    </details>
  );
}
