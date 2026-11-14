"use client";

import { useState, useTransition } from "react";
import { rateQuote } from "@/app/downbeat/quote-actions";
import type { Quote } from "@/lib/quotes";

// The day's quote on Downbeat: one flat, light box, the words, who said it,
// and a tiny thumbs up / down in the bottom right corner.
export function DailyQuote({
  quote,
  day,
  vote: initial,
  canRate,
}: {
  quote: Quote;
  day: string;
  vote: -1 | 0 | 1;
  canRate: boolean;
}) {
  const [vote, setVote] = useState(initial);
  const [, startTransition] = useTransition();

  function rate(v: -1 | 1) {
    const next = vote === v ? 0 : v;
    const before = vote;
    setVote(next);
    startTransition(async () => {
      const ok = await rateQuote(day, next);
      if (!ok) setVote(before);
    });
  }

  const lines = quote.text.split(" / ");
  return (
    <figure className="m-0 rounded-xl border border-rule bg-sheet px-3.5 pb-1.5 pt-3">
      <blockquote className="m-0 font-display text-[16px] leading-snug text-ink">
        {lines.map((l, i) => (
          <span key={i} className="block">
            {l}
          </span>
        ))}
      </blockquote>
      <div className="mt-1.5 flex items-end gap-2">
        <figcaption className="min-w-0 flex-1 text-[13px] leading-snug text-muted">
          <span className="text-ink/80">{quote.by}</span>
          <span> · {quote.source}</span>
        </figcaption>
        {canRate && (
          <div className="-mr-1.5 flex shrink-0 items-center">
            <Thumb up active={vote === 1} onClick={() => rate(1)} />
            <Thumb active={vote === -1} onClick={() => rate(-1)} />
          </div>
        )}
      </div>
    </figure>
  );
}

function Thumb({ up, active, onClick }: { up?: boolean; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={up ? "More like this" : "Fewer like this"}
      title={up ? "More like this" : "Fewer like this"}
      className={`grid h-7 w-6 place-items-center rounded-md bg-transparent p-0 ${
        active ? "text-accent" : "text-muted/60 hover:text-muted"
      }`}
    >
      <svg
        viewBox="0 0 24 24"
        width="13"
        height="13"
        fill={active ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
        style={up ? undefined : { transform: "scaleY(-1)" }}
        aria-hidden
      >
        <path d="M7 10v11H3V10h4Zm0 0 4-8a3 3 0 0 1 3 3v4h5.5a2 2 0 0 1 2 2.3l-1.4 8A2 2 0 0 1 18.1 21H7" />
      </svg>
    </button>
  );
}
