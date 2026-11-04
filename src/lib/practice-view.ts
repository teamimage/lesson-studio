// Proposed version, Home practice: the teacher can flip between their own
// view (overview of every student, teacher notes) and exactly what a family
// sees. Kept in a cookie so the choice follows them from the overview into
// each child's page and back.
export type PracticeView = "teacher" | "family";
export const PRACTICE_VIEW_COOKIE = "ls_practice_view";

export function parsePracticeView(v: string | undefined | null): PracticeView {
  return v === "family" ? "family" : "teacher";
}
