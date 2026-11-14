import Link from "next/link";
import { Card, SectionTitle } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { formatClock } from "@/lib/lesson-moments";
import type { Playbook } from "@/lib/playbook/data";
import { KIND_WORDS, MAX_WAITING, WORD_EXPIRES_DAYS, type CardQuote, type PlaybookCard } from "@/lib/playbook/types";
import { CardAnswer, ReadLessonsButton } from "./playbook-forms";

// "From your lessons": the teacher's playbook. Cards the app drew from her
// own lesson recordings, each with the moments it came from, waiting for
// Keep, Edit or Not me; then the cards she has kept, which every review and
// lesson draft follows. Teacher only.

function Moments({ quotes }: { quotes: CardQuote[] }) {
  if (!quotes.length) return null;
  return (
    <ul className="flex flex-col gap-1 text-sm text-muted">
      {quotes.map((q, i) => (
        <li key={i}>
          <Link
            href={q.recording_id ? `/recordings/${q.recording_id}/full?t=${q.seconds}` : `/lessons/${q.lesson_id}`}
            className="whitespace-nowrap font-medium text-accent-ink underline"
          >
            ▶ {formatDate(q.lesson_date)} · {formatClock(q.seconds)}
          </Link>{" "}
          “{q.quote}”
        </li>
      ))}
    </ul>
  );
}

function CardRow({ card, kept = false }: { card: PlaybookCard; kept?: boolean }) {
  return (
    <li className="flex flex-col gap-2 py-4 first:pt-0 last:pb-0">
      <div className="text-[13px] font-semibold uppercase tracking-[0.1em] text-muted">
        {KIND_WORDS[card.kind]}
        {card.instrument ? ` · ${card.instrument}` : ""}
        {kept && card.kind !== "rule" && card.last_heard_on ? ` · last heard ${formatDate(card.last_heard_on)}` : ""}
      </div>
      <CardAnswer id={card.id} body={card.body} kept={kept} />
      <Moments quotes={card.quotes} />
    </li>
  );
}

export function PlaybookSection({ data }: { data: Playbook }) {
  if (!data.ready) return null;
  const canRead = data.unread > 0 && data.waiting.length < MAX_WAITING;
  return (
    <section id="playbook" className="scroll-mt-6">
      <SectionTitle>From your lessons</SectionTitle>
      <Card className="mt-2 flex flex-col gap-4">
        <p className="text-sm text-muted">
          The app reads your lesson recordings and writes down what you do again and again, in your words, with the moments it came from. Nothing
          is used until you keep it. Change the words first if they aren&apos;t quite yours. Kept cards are followed by every practice review and
          lesson draft, beside your profile below.
        </p>

        {data.waiting.length > 0 ? (
          <div>
            <h3 className="mb-3 font-display text-[18px] font-semibold">Is this how you teach?</h3>
            <ul className="flex flex-col divide-y divide-rule">
              {data.waiting.map((c) => (
                <CardRow key={c.id} card={c} />
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-[16px]">
            {data.unread > 0
              ? `${data.unread} lesson recording${data.unread === 1 ? "" : "s"} not read yet.`
              : "Every lesson recording so far has been read. New cards appear after your next recorded lessons."}
          </p>
        )}
        {canRead && <ReadLessonsButton label={data.waiting.length ? "Read more of my lessons" : "Read my recent lessons"} />}

        {data.kept.length > 0 && (
          <details className="border-t border-rule pt-3">
            <summary className="cursor-pointer list-none font-display text-[18px] font-semibold [&::-webkit-details-marker]:hidden">
              Your playbook · {data.kept.length} kept
            </summary>
            <p className="mt-1 text-sm text-muted">
              A cue or word you haven&apos;t said in a lesson for {WORD_EXPIRES_DAYS} days stops being used until it is heard again. Rules stay until
              you remove them.{" "}
              <Link href="/settings/assistant/playbook" className="text-accent-ink underline">
                Open as one page to copy or print
              </Link>
            </p>
            <ul className="mt-3 flex flex-col divide-y divide-rule">
              {data.kept.map((c) => (
                <CardRow key={c.id} card={c} kept />
              ))}
            </ul>
          </details>
        )}
      </Card>
    </section>
  );
}
