"use server";

import { getViewer } from "@/lib/auth";
import { listPracticeDays, type PracticeDay } from "@/lib/practice/data";
import { monthRange } from "@/lib/practice/month";
import { listLessonMarks } from "@/lib/lesson-marks";
import type { LessonMark } from "@/lib/lesson-mark-types";

export type PracticeMonth = { days: Record<string, PracticeDay>; lessons: Record<string, LessonMark[]> };

/** One month of the practice calendar, with its lesson days. Row-level security decides what the viewer may see. */
export async function loadPracticeMonth(studentId: string, month: string): Promise<PracticeMonth> {
  if (!/^\d{4}-\d{2}$/.test(month)) return { days: {}, lessons: {} };
  await getViewer(); // signed in, or off to /login
  const [from, to] = monthRange(month);
  const [days, lessons] = await Promise.all([listPracticeDays(studentId, from, to), listLessonMarks(studentId, from, to)]);
  return { days, lessons };
}
