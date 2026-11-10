import Link from "next/link";
import type { LengthCheck } from "@/lib/lesson-length";
import { applyVideoLength } from "@/app/lessons/length-actions";

/**
 * One plain line on the lesson page when its length needs a person: the
 * video's length couldn't be read, or the typed length is far from it.
 */
export function LengthFlag({ check, lessonId, studentId }: { check: LengthCheck | undefined; lessonId: string; studentId: string }) {
  if (!check?.flag) return null;
  if (check.flag === "unknown") {
    return (
      <p className="text-[16px]">
        Couldn&apos;t read the video&apos;s length.{" "}
        <Link href={`/lessons/${lessonId}/edit`} className="text-accent-ink underline">
          Set the length
        </Link>
      </p>
    );
  }
  return (
    <form action={applyVideoLength} className="flex flex-wrap items-baseline gap-x-2 text-[16px]">
      <input type="hidden" name="lesson_id" value={lessonId} />
      <input type="hidden" name="student_id" value={studentId} />
      <span>
        Length is {check.minutes} min; the video is {check.videoMinutes} min.
      </span>
      <button className="text-accent-ink underline">Use {check.videoMinutes} min</button>
    </form>
  );
}
