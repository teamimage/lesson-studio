import "server-only";
import { createClient } from "@/lib/supabase/server";
import { PHOTOS_BUCKET } from "@/lib/constants";

type Db = Awaited<ReturnType<typeof createClient>>;

/** Largest photo we accept after the phone has shrunk it. */
const MAX_BYTES = 10 * 1024 * 1024;

/**
 * Applies the photo fields of a student form: a new "photo" file replaces
 * the old photo, and "remove_photo=1" takes it away. Does nothing when
 * neither is present. Returns false if an upload failed.
 */
export async function applyPhotoFromForm(
  db: Db,
  teacherId: string,
  studentId: string,
  fd: FormData,
): Promise<boolean> {
  const file = fd.get("photo");
  const remove = String(fd.get("remove_photo") ?? "") === "1";
  const hasFile = file instanceof File && file.size > 0;
  if (!hasFile && !remove) return true;

  const { data: current } = await db.from("students").select("photo_path").eq("id", studentId).maybeSingle();
  const oldPath = current?.photo_path ?? null;

  if (hasFile) {
    if (file.size > MAX_BYTES || !/^image\/(jpeg|png|webp)$/.test(file.type)) return false;
    const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const path = `${teacherId}/${studentId}/${Date.now()}.${ext}`;
    const { error } = await db.storage.from(PHOTOS_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
    if (error) return false;
    const { error: saveError } = await db
      .from("students")
      .update({ photo_path: path, photo_updated_at: new Date().toISOString() })
      .eq("id", studentId);
    if (saveError) {
      await db.storage.from(PHOTOS_BUCKET).remove([path]);
      return false;
    }
  } else {
    await db.from("students").update({ photo_path: null, photo_updated_at: new Date().toISOString() }).eq("id", studentId);
  }
  if (oldPath) await db.storage.from(PHOTOS_BUCKET).remove([oldPath]);
  return true;
}
