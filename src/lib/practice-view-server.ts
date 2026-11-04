import "server-only";
import { cookies } from "next/headers";
import { PRACTICE_VIEW_COOKIE, parsePracticeView, type PracticeView } from "@/lib/practice-view";

/** Teacher or Family view of Home practice. Call only inside a Suspense'd (dynamic) component. */
export async function getPracticeView(): Promise<PracticeView> {
  const jar = await cookies();
  return parsePracticeView(jar.get(PRACTICE_VIEW_COOKIE)?.value);
}
