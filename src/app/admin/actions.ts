"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { removeStudentFiles, requireAdmin } from "@/lib/admin";
import { ADMIN_FIELDS, isAdminTable, type FieldSpec } from "@/lib/admin-fields";
import { RECORDINGS_BUCKET, SCORES_BUCKET } from "@/lib/constants";

function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}

/** Only allow redirects back into /admin. */
function backTo(fd: FormData): string {
  const b = str(fd, "_back");
  return b.startsWith("/admin") ? b : "/admin";
}

function withFlag(path: string, flag: string) {
  return `${path}${path.includes("?") ? "&" : "?"}${flag}`;
}

function parseField(fd: FormData, key: string, spec: FieldSpec): unknown {
  if (spec.kind === "bool") return fd.getAll(key).includes("on");
  const raw = str(fd, key);
  if (!raw) return spec.required ? undefined : null;
  if (spec.kind === "int") {
    const n = Number(raw);
    return Number.isFinite(n) ? Math.round(n) : null;
  }
  if (spec.kind === "email") return raw.toLowerCase();
  return raw;
}

export async function adminUpdate(fd: FormData) {
  const { db } = await requireAdmin();
  const table = str(fd, "_table");
  const id = str(fd, "_id");
  const back = backTo(fd);
  if (!isAdminTable(table) || !id) redirect(withFlag(back, "error=1"));

  const specs = ADMIN_FIELDS[table] as Record<string, FieldSpec>;
  const patch: Record<string, unknown> = {};
  for (const [key, spec] of Object.entries(specs)) {
    if (!fd.has(key) && spec.kind !== "bool") continue;
    const v = parseField(fd, key, spec);
    if (v !== undefined) patch[key] = v;
  }
  if (table === "lessons" && "status" in patch) {
    patch.approved_at = patch.status === "approved" ? new Date().toISOString() : null;
  }

  // The table name is checked against ADMIN_FIELDS above, so the cast is safe.
  const { error } = await db.from(table as "students").update(patch as never).eq("id", id);
  revalidatePath("/", "layout");
  redirect(withFlag(back, error ? "error=1" : "saved=1"));
}

export async function adminDelete(fd: FormData) {
  const { db } = await requireAdmin();
  const table = str(fd, "_table");
  const id = str(fd, "_id");
  const back = backTo(fd);
  if (!isAdminTable(table) || table === "teachers" || !id) redirect(withFlag(back, "error=1"));

  // Clean up stored files before the rows that point at them disappear.
  if (table === "students") await removeStudentFiles(db, [id]);
  if (table === "lessons") await removeStudentFiles(db, [], id);
  if (table === "recordings") {
    const { data } = await db.from("recordings").select("storage_path").eq("id", id).maybeSingle();
    if (data) await db.storage.from(RECORDINGS_BUCKET).remove([data.storage_path]);
  }
  if (table === "scores") {
    const { data } = await db.from("scores").select("pages").eq("id", id).maybeSingle();
    const paths = Array.isArray(data?.pages)
      ? (data.pages as { path?: string }[]).map((p) => p.path).filter((p): p is string => !!p)
      : [];
    if (paths.length) await db.storage.from(SCORES_BUCKET).remove(paths);
  }

  const { error } = await db.from(table as "students").delete().eq("id", id);
  revalidatePath("/", "layout");
  redirect(withFlag(back, error ? "error=1" : "deleted=1"));
}

export async function adminCreateStudent(fd: FormData) {
  const { db } = await requireAdmin();
  const teacherId = str(fd, "teacher_id");
  const name = str(fd, "name");
  if (!teacherId || !name) redirect(`/admin/teachers/${teacherId}?error=1`);
  const { data, error } = await db
    .from("students")
    .insert({ teacher_id: teacherId, name, instrument: str(fd, "instrument") || "piano" })
    .select("id")
    .single();
  if (error || !data) redirect(`/admin/teachers/${teacherId}?error=1`);
  revalidatePath("/", "layout");
  redirect(`/admin/students/${data.id}?saved=1`);
}

export async function adminLinkParent(fd: FormData) {
  const { db } = await requireAdmin();
  const teacherId = str(fd, "teacher_id");
  const studentId = str(fd, "student_id");
  const email = str(fd, "email").toLowerCase();
  const back = `/admin/students/${studentId}`;
  if (!teacherId || !studentId || !email) redirect(`${back}?error=1`);

  const { data: existing } = await db
    .from("parents")
    .select("id")
    .eq("teacher_id", teacherId)
    .eq("email", email)
    .maybeSingle();
  let parentId = existing?.id;
  if (!parentId) {
    const { data: created } = await db
      .from("parents")
      .insert({ teacher_id: teacherId, name: str(fd, "name") || "Parent", email })
      .select("id")
      .single();
    parentId = created?.id;
  }
  if (!parentId) redirect(`${back}?error=1`);
  await db.from("student_parents").upsert({ student_id: studentId, parent_id: parentId });
  revalidatePath("/", "layout");
  redirect(`${back}?saved=1`);
}

export async function adminUnlinkParent(fd: FormData) {
  const { db } = await requireAdmin();
  const studentId = str(fd, "student_id");
  const parentId = str(fd, "parent_id");
  await db.from("student_parents").delete().eq("student_id", studentId).eq("parent_id", parentId);
  revalidatePath("/", "layout");
  redirect(`/admin/students/${studentId}?saved=1`);
}

export async function adminMakeTeacher(fd: FormData) {
  const { db } = await requireAdmin();
  const { data, error } = await db.rpc("admin_make_teacher", { uid: str(fd, "user_id") });
  if (error || !data) redirect("/admin?error=1");
  revalidatePath("/", "layout");
  redirect(`/admin/teachers/${data}?saved=1`);
}

export async function adminDeleteAccount(fd: FormData) {
  const { db, viewer } = await requireAdmin();
  const userId = str(fd, "user_id");
  if (!userId || userId === viewer.userId) redirect("/admin?error=self");

  // Remove the studio's stored files; rows go with the account (cascade).
  const { data: teacher } = await db.from("teachers").select("id").eq("user_id", userId).maybeSingle();
  if (teacher) {
    const { data: students } = await db.from("students").select("id").eq("teacher_id", teacher.id);
    await removeStudentFiles(db, (students ?? []).map((s) => s.id));
  }
  const { error } = await db.rpc("admin_delete_user", { uid: userId });
  revalidatePath("/", "layout");
  redirect(error ? "/admin?error=1" : "/admin?deleted=1");
}
