"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireTeacher } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  ALL_GRADES,
  DEFINITION_MAX,
  GRADING_STANDARDS,
  GRADING_SYSTEMS,
  PRESET_DEFINITIONS,
  parseGrading,
  parseStudentGrading,
  type GradingConfig,
  type GradingStandard,
  type GradingSystem,
  type StudentGrading,
} from "@/lib/grading";
import type { Json } from "@/lib/supabase/types";

type Db = Awaited<ReturnType<typeof createClient>>;

function pick<T extends string>(v: FormDataEntryValue | null, list: readonly T[], fallback: T): T {
  return typeof v === "string" && (list as readonly string[]).includes(v) ? (v as T) : fallback;
}

/** Copy the studio default onto every student who follows it. */
async function spreadStudio(db: Db, teacherId: string, studio: GradingConfig) {
  const { data: students } = await db.from("students").select("*").eq("teacher_id", teacherId);
  for (const s of students ?? []) {
    const own = parseStudentGrading((s as { grading?: unknown }).grading);
    const next: StudentGrading = own && !own.follows_studio
      ? { ...own, definitions: studio.definitions }
      : { ...studio, follows_studio: true };
    await db
      .from("students")
      .update({ grading: next as unknown as Json } as never)
      .eq("id", s.id);
  }
}

// The studio default: system, standard and the teacher's own wording for each grade.
export async function saveStudioGrading(fd: FormData) {
  const { teacher } = await requireTeacher();
  const db = await createClient();
  const current = parseGrading((teacher as { grading?: unknown }).grading);
  const system = pick<GradingSystem>(fd.get("system"), GRADING_SYSTEMS, current.system);
  const standard = pick<GradingStandard>(fd.get("standard"), GRADING_STANDARDS, current.standard);
  const definitions: GradingConfig["definitions"] = { ...current.definitions };
  for (const g of ALL_GRADES) {
    const v = fd.get(`def_${g}`);
    if (v === null) continue; // not on this form (the other system's grades)
    const text = String(v).trim().slice(0, DEFINITION_MAX);
    // Blank, or any standard's preset word for word, means "use the preset"
    // (so switching standard picks up the new standard's wording).
    if (!text || GRADING_STANDARDS.some((st) => PRESET_DEFINITIONS[st][g] === text)) delete definitions[g];
    else definitions[g] = text;
  }
  if (fd.get("reset") === "1") for (const g of ALL_GRADES) delete definitions[g];
  const studio: GradingConfig = { system, standard, definitions };
  const { error } = await db
    .from("teachers")
    .update({ grading: studio as unknown as Json } as never)
    .eq("id", teacher.id);
  if (error) redirect("/settings/grading?saved=setup");
  await spreadStudio(db, teacher.id, studio);
  revalidatePath("/", "layout");
  redirect("/settings/grading?saved=studio");
}

// Students who don't follow the studio default.
export async function saveStudentGrading(fd: FormData) {
  const { teacher } = await requireTeacher();
  const db = await createClient();
  const studio = parseGrading((teacher as { grading?: unknown }).grading);
  const { data: students } = await db.from("students").select("id").eq("teacher_id", teacher.id);
  for (const s of students ?? []) {
    const sys = fd.get(`system_${s.id}`);
    if (sys === null) continue;
    const std = fd.get(`standard_${s.id}`);
    const follows = sys === "studio" && (std === "studio" || std === null);
    const next: StudentGrading = follows
      ? { ...studio, follows_studio: true }
      : {
          system: sys === "studio" ? studio.system : pick<GradingSystem>(sys, GRADING_SYSTEMS, studio.system),
          standard: std === "studio" ? studio.standard : pick<GradingStandard>(std, GRADING_STANDARDS, studio.standard),
          definitions: studio.definitions,
          follows_studio: false,
        };
    const { error } = await db
      .from("students")
      .update({ grading: next as unknown as Json } as never)
      .eq("id", s.id);
    if (error) redirect("/settings/grading?saved=setup#students");
  }
  revalidatePath("/", "layout");
  redirect("/settings/grading?saved=students#students");
}
