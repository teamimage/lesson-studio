import { Suspense } from "react";
import { notFound } from "next/navigation";
import { getViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { RECORDINGS_BUCKET } from "@/lib/constants";

export const metadata = { title: "Full quality video" };

type Params = Promise<{ id: string }>;

/**
 * The original, full-quality lesson video in its own window. The lesson page
 * plays the fast streaming copy; its "Full quality" link opens this. Anyone
 * who can see the recording row (its teacher, or a parent of an approved
 * lesson) can open it.
 */
export default function FullQualityPage({ params }: { params: Params }) {
  return (
    <div className="flex min-h-dvh flex-1 flex-col bg-black text-white">
      <Suspense fallback={null}>
        <Body params={params} />
      </Suspense>
    </div>
  );
}

async function Body({ params }: { params: Params }) {
  await getViewer();
  const { id } = await params;
  const supabase = await createClient();
  const { data: rec } = await supabase
    .from("recordings")
    .select("storage_path, file_name, label, status")
    .eq("id", id)
    .maybeSingle();
  if (!rec || rec.status !== "ready") notFound();
  const { data: link } = await supabase.storage.from(RECORDINGS_BUCKET).createSignedUrl(rec.storage_path, 6 * 60 * 60);
  if (!link?.signedUrl) notFound();

  return (
    <>
      <div className="flex items-center gap-3 px-4 py-2 text-sm text-white/80">
        <span className="font-medium text-white">{rec.label || rec.file_name}</span>
        <span>Full quality. Large file, so it can take a moment to start.</span>
      </div>
      {/* #t=0.1 makes iPhone Safari show the first frame instead of a black box. */}
      <video
        controls
        autoPlay
        playsInline
        preload="auto"
        src={`${link.signedUrl}#t=0.1`}
        className="min-h-0 w-full flex-1 bg-black object-contain"
      />
    </>
  );
}
