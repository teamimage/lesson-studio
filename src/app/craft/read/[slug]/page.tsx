import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Shell } from "@/components/shell";
import { Me } from "@/components/v3/me";
import { CraftSources } from "@/components/craft-sources";
import { requireTeacher } from "@/lib/auth";
import { articleBySlug } from "@/lib/craft/content";

type Params = Promise<{ slug: string }>;

// One Craft article: plain reading, sources at the end.
export default function CraftArticlePage({ params }: { params: Params }) {
  return (
    <Suspense fallback={<Shell title=" " back={{ href: "/downbeat#craft", label: "Intro" }} tab="downbeat">{null}</Shell>}>
      <Body params={params} />
    </Suspense>
  );
}

async function Body({ params }: { params: Params }) {
  await requireTeacher();
  const { slug } = await params;
  const article = articleBySlug(slug);
  if (!article) notFound();
  return (
    <Shell title={article.title} back={{ href: "/downbeat#craft", label: "Intro" }} tab="downbeat" me={<Me />}>
      <article className="flex max-w-2xl flex-col gap-3">
        <p className="m-0 text-sm text-muted">{article.minutes} min read</p>
        {article.body.map((p, i) => (
          <p key={i} className="m-0 text-[16px] leading-relaxed">
            {p}
          </p>
        ))}
        <div className="mt-3 border-t border-rule pt-3">
          <div className="mb-1 text-sm font-semibold">Sources</div>
          <CraftSources sources={article.sources} />
        </div>
      </article>
    </Shell>
  );
}
