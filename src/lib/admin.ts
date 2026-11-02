import "server-only";
import { notFound } from "next/navigation";
import { getViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PHOTOS_BUCKET, RECORDINGS_BUCKET, SCORES_BUCKET } from "@/lib/constants";

/** True when the signed-in user is listed in app_admins. */
export async function isAdmin(): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("is_app_admin");
  return data === true;
}

/** Gate for every /admin page and action. Non-admins get a 404. */
export async function requireAdmin() {
  const viewer = await getViewer();
  if (!(await isAdmin())) notFound();
  return { viewer, db: await createAdminClient() };
}

type Db = Awaited<ReturnType<typeof createAdminClient>>;

/** Delete the stored video and score files that belong to some students. */
export async function removeStudentFiles(db: Db, studentIds: string[], lessonId?: string) {
  if (studentIds.length === 0 && !lessonId) return;
  let recQuery = db.from("recordings").select("storage_path");
  recQuery = lessonId ? recQuery.eq("lesson_id", lessonId) : recQuery.in("student_id", studentIds);
  const { data: recs } = await recQuery;
  const videoPaths = (recs ?? []).map((r) => r.storage_path);
  if (videoPaths.length) await db.storage.from(RECORDINGS_BUCKET).remove(videoPaths);
  if (lessonId) return;

  const { data: scores } = await db.from("scores").select("pages, source_path").in("student_id", studentIds);
  const pagePaths = (scores ?? []).flatMap((s) => [
    ...(Array.isArray(s.pages) ? (s.pages as { path?: string }[]).map((p) => p.path).filter((p): p is string => !!p) : []),
    ...(s.source_path ? [s.source_path] : []),
  ]);
  if (pagePaths.length) await db.storage.from(SCORES_BUCKET).remove(pagePaths);

  const { data: photos } = await db.from("students").select("photo_path").in("id", studentIds);
  const photoPaths = (photos ?? []).map((p) => p.photo_path).filter((p): p is string => !!p);
  if (photoPaths.length) await db.storage.from(PHOTOS_BUCKET).remove(photoPaths);
}
