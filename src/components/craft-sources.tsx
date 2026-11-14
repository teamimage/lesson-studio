import type { Source } from "@/lib/craft/content";

// The research behind a Craft read, as small links.
export function CraftSources({ sources }: { sources: Source[] }) {
  return (
    <ul className="m-0 flex list-none flex-col gap-0.5 p-0 text-[13px] leading-snug text-muted">
      {sources.map((s) => (
        <li key={s.url + s.label}>
          <a href={s.url} target="_blank" rel="noreferrer" className="text-muted underline">
            {s.label}
          </a>
        </li>
      ))}
    </ul>
  );
}
