"use server";

import { getViewer } from "@/lib/auth";
import { listPracticeDays, type PracticeDay } from "@/lib/practice/data";
import { monthRange } from "@/lib/practice/month";

/** One month of the practice calendar. Row-level security decides what the viewer may see. */
export async function loadPracticeMonth(studentId: string, month: string): Promise<Record<string, PracticeDay>> {
  if (!/^\d{4}-\d{2}$/.test(month)) return {};
  await getViewer(); // signed in, or off to /login
  const [from, to] = monthRange(month);
  return listPracticeDays(studentId, from, to);
}
