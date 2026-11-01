import Link from "next/link";
import { viewerHref } from "@/lib/music-links";

/**
 * "Preview music:" links to each of the student's books, opening the
 * read-only viewer (no music stand, no lesson started, nothing logged).
 */
export function MusicPreviewLinks({
  studentId,
  scores,
  className,
}: {
  studentId: string;
  scores: { id: string; title: string; pageCount: number }[];
  className?: string;
}) {
  const shown = scores.filter((s) => s.pageCount > 0);
  if (!shown.length) return null;
  return (
    <div className={`flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm ${className ?? ""}`}>
      <span className="text-muted">Preview music:</span>
      {shown.map((s) => (
        <Link key={s.id} href={viewerHref(studentId, s.id)} className="font-medium text-accent-ink underline">
          ♪ {s.title}
        </Link>
      ))}
    </div>
  );
}
