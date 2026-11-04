import { ConfirmSubmit } from "@/components/confirm-submit";
import { Pill, cx, inputClass } from "@/components/ui";
import { deleteReference, updateReference } from "@/app/students/reference-actions";
import { formatDuration, type BookChoice, type ReferenceRecording } from "@/lib/reference-recordings";
import { formatBytes } from "@/lib/format";

/**
 * The teacher's reference recordings, grouped by book and in track order.
 * Each row plays in place and can be renamed, re-filed or deleted.
 */
export function ReferenceLibrary({
  recordings,
  urls,
  books,
  studentId,
}: {
  recordings: ReferenceRecording[];
  /** Signed addresses for uploaded files, by recording id. */
  urls: Record<string, string>;
  books: BookChoice[];
  studentId?: string;
}) {
  const groups = new Map<string, ReferenceRecording[]>();
  for (const r of recordings) {
    const key = r.book || "";
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const order = [...groups.keys()].sort((a, b) => {
    if (!a) return 1;
    if (!b) return -1;
    return a.localeCompare(b, undefined, { numeric: true });
  });
  const bookNames = [...new Set([...books.map((b) => b.book), ...order.filter(Boolean)])];

  return (
    <div className="flex flex-col gap-3">
      <datalist id="reference-books">
        {bookNames.map((b) => (
          <option key={b} value={b} />
        ))}
      </datalist>
      {order.map((book) => {
        const rows = groups.get(book)!;
        return (
          <details key={book || "none"} className="group rounded-2xl border border-rule bg-sheet" open={order.length <= 2}>
            <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 [&::-webkit-details-marker]:hidden">
              <span className="min-w-0 flex-1 truncate font-semibold">{book || "Not in a book"}</span>
              <Pill tone="plum">
                {rows.length} track{rows.length === 1 ? "" : "s"}
              </Pill>
              <span className="text-xs text-muted transition-transform group-open:rotate-90" aria-hidden>
                ›
              </span>
            </summary>
            <ol className="divide-y divide-rule border-t border-rule">
              {rows.map((r) => (
                <ReferenceRow key={r.id} r={r} url={urls[r.id]} studentId={studentId} />
              ))}
            </ol>
          </details>
        );
      })}
    </div>
  );
}

function ReferenceRow({ r, url, studentId }: { r: ReferenceRecording; url?: string; studentId?: string }) {
  const meta = [
    r.source === "link" ? "link" : null,
    formatDuration(r.duration_seconds),
    r.size_bytes ? formatBytes(r.size_bytes) : null,
  ].filter(Boolean);
  return (
    <li className="flex flex-col gap-2 px-3 py-2.5">
      <details className="group/edit">
        <summary className="flex cursor-pointer list-none items-baseline gap-2 [&::-webkit-details-marker]:hidden">
          <span className="w-7 shrink-0 text-right text-sm tabular-nums text-muted">{r.track_no ?? "–"}</span>
          <span className="min-w-0 flex-1 font-medium">{r.title}</span>
          {r.status === "uploading" && <Pill tone="amber">uploading</Pill>}
          {r.status === "failed" && <Pill tone="amber">upload didn&apos;t finish</Pill>}
          <span className="shrink-0 text-xs text-muted">{meta.join(" · ")}</span>
          <span className="shrink-0 text-sm text-accent-ink group-open/edit:hidden">Edit</span>
        </summary>
        <form action={updateReference} className="mt-2 flex flex-col gap-2 pl-9">
          <input type="hidden" name="id" value={r.id} />
          {studentId && <input type="hidden" name="student_id" value={studentId} />}
          <div className="flex gap-2">
            <input
              name="track_no"
              defaultValue={r.track_no ?? ""}
              inputMode="numeric"
              placeholder="#"
              aria-label="Track number"
              className={cx(inputClass, "w-14 shrink-0 px-2 text-center")}
            />
            <input name="title" defaultValue={r.title} required aria-label="Title" className={cx(inputClass, "min-w-0 flex-1")} />
          </div>
          <input
            name="book"
            defaultValue={r.book ?? ""}
            list="reference-books"
            placeholder="Book (empty for none)"
            aria-label="Book"
            className={inputClass}
          />
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <button className="font-medium text-accent-ink">Save</button>
            <span className="ml-auto" />
            <ConfirmSubmit
              formAction={deleteReference}
              message={`Delete "${r.title}"? Practice items that use it stay, without the player.`}
              className="text-danger underline"
            >
              Delete
            </ConfirmSubmit>
          </div>
          <p className="text-xs text-muted">
            {r.file_name ? `File: ${r.file_name}. ` : ""}
            {r.rights
              ? `✓ Ownership confirmed${r.rights.email ? ` by ${r.rights.email}` : ""} on ${new Date(r.rights.at).toLocaleDateString(
                  "en-US",
                  { month: "short", day: "numeric", year: "numeric" },
                )}.`
              : ""}
          </p>
        </form>
      </details>
      {r.source === "file" && r.status === "ready" && url && (
        <audio controls preload="none" src={url} className="h-9 w-full pl-9" />
      )}
      {r.source === "link" && r.link_url && (
        <a href={r.link_url} target="_blank" rel="noreferrer" className="truncate pl-9 text-sm text-accent-ink underline">
          {r.link_url}
        </a>
      )}
    </li>
  );
}
