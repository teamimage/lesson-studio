import type { Repertoire } from "@/lib/data";
import { formatDate, humanize } from "@/lib/format";
import { booksFor, matchesPiece } from "@/lib/suzuki";
import { setRepertoireStatus, addRepertoire } from "@/app/students/repertoire-actions";
import { Constants } from "@/lib/supabase/types";
import { Card, Input, Pill, Select, cx } from "./ui";
import { SubmitOnChange } from "./submit-on-change";
import Link from "next/link";
import { findSection, viewerHref } from "@/lib/music-links";
import type { ScoreSection } from "@/lib/score-analysis";

/** The student's uploaded music, so pieces and books link to a read-only preview. */
export type MapScore = {
  id: string;
  title: string;
  book: string;
  sections: ScoreSection[];
};

const STATUS_TONE: Record<Repertoire["status"], "accent" | "sage" | "plum" | "amber" | "muted"> = {
  preview: "plum",
  learning: "accent",
  polishing: "amber",
  review: "sage",
  performed: "muted",
};

// The repertoire map: every piece in the student's Suzuki books with its
// status, plus any pieces outside the books. Teachers can correct a status.
export function RepertoireMap({
  studentId,
  instrument,
  repertoire,
  editable,
  scores = [],
}: {
  studentId: string;
  instrument: string;
  repertoire: Repertoire[];
  editable?: boolean;
  scores?: MapScore[];
}) {
  const pieceHref = (title: string): string | null => {
    const f = findSection(scores, title);
    return f
      ? viewerHref(studentId, f.score.id, {
          from: f.section.start_page,
          to: f.section.end_page,
        })
      : null;
  };
  // "Suzuki Cello Book 2" ↔ an upload titled or identified as that book.
  const bookHref = (book: string): string | null => {
    const [, inst, n] = book.toLowerCase().match(/^suzuki (\w+) book (\d+)$/) ?? [];
    const s = scores.find((x) => {
      const text = `${x.title} ${x.book}`.toLowerCase();
      if (x.title.toLowerCase() === book.toLowerCase()) return true;
      return !!n && text.includes("suzuki") && text.includes(inst) && new RegExp(`(book|volume) ${n}\\b`).test(text);
    });
    return s ? viewerHref(studentId, s.id) : null;
  };
  const books = booksFor(instrument);
  const matched = new Set<string>();
  const sections = books.map((b) => ({
    book: b.book,
    rows: b.pieces.map((title) => {
      const rep = repertoire.find((r) => !matched.has(r.id) && matchesPiece(title, r.title));
      if (rep) matched.add(rep.id);
      return { title, rep };
    }),
  }));
  const extra = repertoire.filter((r) => !matched.has(r.id));

  // Show the book the student is in (first book with an unfinished piece) and
  // collapse earlier, fully reviewed books.
  return (
    <div id="repertoire" className="flex flex-col gap-3">
      {sections.map((s) => {
        const done = s.rows.filter((r) => r.rep && (r.rep.status === "review" || r.rep.status === "performed")).length;
        const touched = s.rows.filter((r) => r.rep).length;
        const open = touched > 0 && done < s.rows.length;
        return (
          <details key={s.book} open={open} className="group rounded-2xl border border-rule bg-sheet">
            <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3">
              <span className="flex-1 font-semibold">{s.book}</span>
              {bookHref(s.book) && (
                <Link href={bookHref(s.book)!} className="text-sm font-medium text-accent-ink underline">
                  ♪ View book
                </Link>
              )}
              <span className="text-sm text-muted">
                {done}/{s.rows.length} in review
              </span>
              <span className="text-muted transition group-open:rotate-90" aria-hidden>
                ›
              </span>
            </summary>
            <ol className="divide-y divide-rule border-t border-rule">
              {s.rows.map((r, i) => (
                <PieceRow
                  key={r.title}
                  index={i + 1}
                  title={r.title}
                  rep={r.rep}
                  studentId={studentId}
                  editable={editable}
                  book={s.book}
                  musicHref={pieceHref(r.title) ?? (r.rep ? pieceHref(r.rep.title) : null)}
                />
              ))}
            </ol>
          </details>
        );
      })}

      {(extra.length > 0 || books.length === 0) && (
        <Card className="p-0">
          <div className="px-4 py-3 font-semibold">{books.length === 0 ? "Repertoire" : "Other pieces"}</div>
          {extra.length === 0 ? (
            <p className="px-4 pb-3 text-sm text-muted">Pieces appear here when a lesson that names them is approved.</p>
          ) : (
            <ol className="divide-y divide-rule border-t border-rule">
              {extra.map((r) => (
                <PieceRow
                  key={r.id}
                  title={r.title}
                  rep={r}
                  studentId={studentId}
                  editable={editable}
                  musicHref={pieceHref(r.title)}
                />
              ))}
            </ol>
          )}
        </Card>
      )}

      {editable && (
        <form action={addRepertoire} className="flex flex-col gap-2 rounded-2xl border border-dashed border-rule p-3 sm:flex-row">
          <input type="hidden" name="student_id" value={studentId} />
          <Input name="title" placeholder="Add a piece not in the books" required className="flex-1" />
          <div className="flex gap-2">
            <Select name="status" defaultValue="learning" className="w-36">
              {Constants.public.Enums.repertoire_status.map((s) => (
                <option key={s} value={s}>
                  {humanize(s)}
                </option>
              ))}
            </Select>
            <button className="min-h-11 rounded-xl bg-accent px-4 text-sm font-semibold text-white">Add</button>
          </div>
        </form>
      )}
    </div>
  );
}

function PieceRow({
  index,
  title,
  rep,
  studentId,
  editable,
  book,
  musicHref,
}: {
  musicHref?: string | null;
  index?: number;
  title: string;
  rep?: Repertoire;
  studentId: string;
  editable?: boolean;
  book?: string;
}) {
  return (
    <li className={cx("flex items-center gap-3 px-4 py-2", !rep && "text-muted")}>
      {index !== undefined && <span className="w-5 shrink-0 text-right text-xs tabular-nums text-muted">{index}</span>}
      <div className="min-w-0 flex-1">
        {musicHref ? (
          <Link
            href={musicHref}
            className={cx("block truncate hover:underline", rep ? "font-medium" : "")}
            title="View the music (doesn't open the stand)"
          >
            {rep?.title ?? title} <span className="text-xs text-accent-ink">♪</span>
          </Link>
        ) : (
          <div className={cx("truncate", rep ? "font-medium" : "")}>{rep?.title ?? title}</div>
        )}
        {rep?.last_played_on && <div className="text-xs text-muted">last played {formatDate(rep.last_played_on)}</div>}
      </div>
      {rep ? (
        editable ? (
          <form action={setRepertoireStatus} className="shrink-0">
            <input type="hidden" name="id" value={rep.id} />
            <input type="hidden" name="student_id" value={studentId} />
            <select
              name="status"
              defaultValue={rep.status}
              className={cx(
                "rounded-full border-0 py-0.5 pl-2.5 pr-7 text-xs font-medium",
                STATUS_TONE[rep.status] === "accent" && "bg-accent-soft text-accent-ink",
                STATUS_TONE[rep.status] === "sage" && "bg-sage-soft text-sage",
                STATUS_TONE[rep.status] === "plum" && "bg-plum-soft text-plum",
                STATUS_TONE[rep.status] === "amber" && "bg-amber-soft text-amber",
                STATUS_TONE[rep.status] === "muted" && "bg-rule/60 text-muted",
              )}
              aria-label={`Status of ${rep.title}`}
            >
              {Constants.public.Enums.repertoire_status.map((s) => (
                <option key={s} value={s}>
                  {humanize(s)}
                </option>
              ))}
              <option value="remove">Remove</option>
            </select>
            <noscript>
              <button className="ml-1 text-xs underline">Save</button>
            </noscript>
            <SubmitOnChange />
          </form>
        ) : (
          <Pill tone={STATUS_TONE[rep.status]}>{humanize(rep.status)}</Pill>
        )
      ) : editable && book ? (
        <form action={addRepertoire} className="shrink-0">
          <input type="hidden" name="student_id" value={studentId} />
          <input type="hidden" name="title" value={title} />
          <input type="hidden" name="book" value={book} />
          <input type="hidden" name="status" value="learning" />
          <button className="rounded-full px-2.5 py-0.5 text-xs font-medium text-accent-ink hover:bg-accent-soft">+ Start</button>
        </form>
      ) : (
        <span className="text-xs text-muted">not yet</span>
      )}
    </li>
  );
}
