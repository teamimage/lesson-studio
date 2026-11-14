import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { withStatus } from "./rules";
import { rowTags, type RowTag } from "./tags";
import type { FocusEventRow, FocusItem, FocusItemRow } from "./types";

type Db = Awaited<ReturnType<typeof createClient>>;

/**
 * The focus tables aren't in the generated types, and every read here must
 * return "nothing" rather than break a page before working-on.sql has run.
 */
export function focusDb(db: Db): SupabaseClient {
  return db as unknown as SupabaseClient;
}

export type WorkingOn = {
  /** False until working-on.sql has been run. */
  ready: boolean;
  open: FocusItem[];
  watching: FocusItem[];
  /** Teacher only (families can't read these rows). */
  proposed: FocusItemRow[];
  /** The lesson the newest open point came from. */
  lessonDate: string | null;
  events: FocusEventRow[];
};

const EMPTY: WorkingOn = { ready: false, open: [], watching: [], proposed: [], lessonDate: null, events: [] };

export async function getWorkingOn(studentId: string): Promise<WorkingOn> {
  const db = focusDb(await createClient());
  const { data: items, error } = await db
    .from("focus_items")
    .select("*")
    .eq("student_id", studentId)
    .neq("state", "closed")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) return EMPTY;
  const rows = (items ?? []) as FocusItemRow[];
  if (!rows.length) return { ...EMPTY, ready: true };
  const { data: ev } = await db
    .from("focus_events")
    .select("*")
    .in(
      "focus_item_id",
      rows.map((r) => r.id),
    )
    .order("event_date", { ascending: true })
    .order("created_at", { ascending: true });
  const events = (ev ?? []) as FocusEventRow[];
  const open = rows.filter((r) => r.state === "open").map((r) => withStatus(r, events));
  const lessonIds = [...new Set(open.map((o) => o.lesson_id).filter((x): x is string => !!x))];
  let lessonDate: string | null = null;
  if (lessonIds.length) {
    const { data: lessons } = await db.from("lessons").select("lesson_date").in("id", lessonIds).order("lesson_date", { ascending: false }).limit(1);
    lessonDate = (lessons?.[0] as { lesson_date: string } | undefined)?.lesson_date ?? null;
  }
  return {
    ready: true,
    open,
    watching: rows.filter((r) => r.state === "watching").map((r) => withStatus(r, events)),
    proposed: rows.filter((r) => r.state === "proposed"),
    lessonDate,
    events,
  };
}

/** The open points only, for a practice review. Empty before the SQL has run. */
export async function openFocus(
  db: Db,
  studentId: string,
  opts: { before?: string; notSession?: string } = {},
): Promise<FocusItem[]> {
  const f = focusDb(db);
  const { data: items, error } = await f
    .from("focus_items")
    .select("*")
    .eq("student_id", studentId)
    .eq("state", "open")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (error || !items?.length) return [];
  const rows = items as FocusItemRow[];
  const { data: ev } = await f
    .from("focus_events")
    .select("*")
    .in(
      "focus_item_id",
      rows.map((r) => r.id),
    );
  const events = ((ev ?? []) as FocusEventRow[]).filter(
    (e) => (!opts.before || e.event_date <= opts.before) && (!opts.notSession || e.practice_session_id !== opts.notSession),
  );
  return rows.map((r) => withStatus(r, events));
}

/** What a lesson said about each point, for the line at the top of its record. */
export async function lessonFocusEvents(lessonId: string): Promise<{ title: string; verdict: FocusEventRow["verdict"] }[]> {
  const db = focusDb(await createClient());
  const { data, error } = await db.from("focus_events").select("verdict, focus_items(title)").eq("lesson_id", lessonId).eq("source", "lesson");
  if (error || !data) return [];
  return (data as unknown as { verdict: FocusEventRow["verdict"]; focus_items: { title: string } | null }[]).flatMap((r) =>
    r.focus_items ? [{ title: r.focus_items.title, verdict: r.verdict }] : [],
  );
}

/**
 * Tags for the rows of one lesson's checklist: "Do first" from the focus
 * points, and New / Changed / "3rd lesson" from the lists before it.
 */
export async function checklistTags(lesson: {
  id: string;
  student_id: string;
  lesson_date: string;
  assignments: { id: string; title: string; how: string | null }[];
}): Promise<Record<string, RowTag>> {
  if (!lesson.assignments.length) return {};
  const db = await createClient();
  const [{ data: earlier }, focus] = await Promise.all([
    db
      .from("lessons")
      .select("lesson_date, assignments(id, title, how)")
      .eq("student_id", lesson.student_id)
      .eq("status", "approved")
      .lt("lesson_date", lesson.lesson_date)
      .order("lesson_date", { ascending: false })
      .limit(6),
    openFocus(db, lesson.student_id),
  ]);
  return rowTags(lesson, earlier ?? [], focus.flatMap((f) => f.do_first));
}
