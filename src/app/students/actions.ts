"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireTeacher } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

function str(fd: FormData, key: string): string | null {
  const v = String(fd.get(key) ?? "").trim();
  return v ? v : null;
}

function studentFields(fd: FormData) {
  const ageRaw = str(fd, "age");
  return {
    name: str(fd, "name") ?? "Student",
    instrument: (str(fd, "instrument") ?? "piano").toLowerCase(),
    age: ageRaw ? Number(ageRaw) : null,
    method: str(fd, "method") ?? "Suzuki",
    current_book: str(fd, "current_book"),
    goals: str(fd, "goals"),
    notes: str(fd, "notes"),
    lesson_day: str(fd, "lesson_day"),
    lesson_time: str(fd, "lesson_time"),
    active: fd.has("active") ? fd.getAll("active").includes("on") : true,
  };
}

export async function createStudent(fd: FormData) {
  const { teacher } = await requireTeacher();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("students")
    .insert({ ...studentFields(fd), teacher_id: teacher.id })
    .select("id")
    .single();
  if (error || !data) redirect("/students/new?error=save");

  // Optional parent on the same form.
  const parentEmail = str(fd, "parent_email");
  if (parentEmail) {
    await linkParent(teacher.id, data.id, str(fd, "parent_name") ?? "Parent", parentEmail);
  }

  revalidatePath("/");
  redirect(`/students/${data.id}`);
}

export async function updateStudent(fd: FormData) {
  await requireTeacher();
  const id = String(fd.get("id") ?? "");
  if (!id) redirect("/");
  const supabase = await createClient();
  const { error } = await supabase.from("students").update(studentFields(fd)).eq("id", id);
  if (error) redirect(`/students/${id}/edit?error=save`);
  revalidatePath("/");
  revalidatePath(`/students/${id}`);
  redirect(`/students/${id}`);
}

export async function addParent(fd: FormData) {
  const { teacher } = await requireTeacher();
  const studentId = String(fd.get("student_id") ?? "");
  const email = str(fd, "email");
  if (!studentId || !email) redirect(`/students/${studentId}/edit?error=parent`);
  await linkParent(teacher.id, studentId, str(fd, "name") ?? "Parent", email);
  revalidatePath(`/students/${studentId}`);
  redirect(`/students/${studentId}/edit`);
}

export async function removeParent(fd: FormData) {
  await requireTeacher();
  const studentId = String(fd.get("student_id") ?? "");
  const parentId = String(fd.get("parent_id") ?? "");
  const supabase = await createClient();
  await supabase.from("student_parents").delete().eq("student_id", studentId).eq("parent_id", parentId);
  revalidatePath(`/students/${studentId}`);
  redirect(`/students/${studentId}/edit`);
}

async function linkParent(teacherId: string, studentId: string, name: string, email: string) {
  const supabase = await createClient();
  const lower = email.toLowerCase();
  const { data: existing } = await supabase
    .from("parents")
    .select("id")
    .eq("teacher_id", teacherId)
    .eq("email", lower)
    .maybeSingle();
  let parentId = existing?.id;
  if (!parentId) {
    const { data: created } = await supabase
      .from("parents")
      .insert({ teacher_id: teacherId, name, email: lower })
      .select("id")
      .single();
    parentId = created?.id;
  }
  if (parentId) {
    await supabase.from("student_parents").upsert({ student_id: studentId, parent_id: parentId });
  }
}
