import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PHOTOS_BUCKET } from "@/lib/constants";

// Serves a student's photo from the private bucket. Database and storage
// rules decide who may see it: the student's teacher, the student's parents,
// and admins. The ?v= version in the address changes with each new photo,
// so the browser can keep this copy for a long time.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let db = await createClient();
  const { data: claims } = await db.auth.getClaims();
  if (!claims?.claims?.sub) return new Response("Not signed in", { status: 401 });

  let { data: student } = await db.from("students").select("photo_path").eq("id", id).maybeSingle();
  if (!student) {
    // Admins viewing another studio's student.
    const { data: admin } = await db.rpc("is_app_admin");
    if (admin === true) {
      db = await createAdminClient();
      ({ data: student } = await db.from("students").select("photo_path").eq("id", id).maybeSingle());
    }
  }
  if (!student?.photo_path) return new Response("No photo", { status: 404 });

  const { data: file, error } = await db.storage.from(PHOTOS_BUCKET).download(student.photo_path);
  if (error || !file) return new Response("No photo", { status: 404 });

  return new Response(file, {
    headers: {
      "Content-Type": file.type || "image/jpeg",
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
