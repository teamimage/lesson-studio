import { Suspense } from "react";
import Link from "next/link";
import { Shell } from "@/components/shell";
import { Button, Card, Field, Notice, SectionTitle, Textarea, cx } from "@/components/ui";
import { StoreView } from "@/components/store-view";
import { requireTeacher } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SUZUKI_INSTRUMENTS, instrumentLabel } from "@/lib/constants";
import { STORE_CATEGORIES, STORE_LAYOUTS, fitsInstrument, layoutOf } from "@/lib/store";
import { listCatalogue, listPickedIds, recentClickCount } from "@/lib/store-data";
import { saveStoreLayout, saveStorePicks } from "./actions";

type SP = Promise<{ instrument?: string; saved?: string; error?: string }>;

export default function StorePage({ searchParams }: { searchParams: SP }) {
  return (
    <Shell title="Studio store" eyebrow="For your families" back={{ href: "/settings", label: "Settings" }} tab="settings">
      <Suspense>
        <Body searchParams={searchParams} />
      </Suspense>
    </Shell>
  );
}

async function Body({ searchParams }: { searchParams: SP }) {
  const { teacher } = await requireTeacher();
  const sp = await searchParams;
  const supabase = await createClient();
  const [catalogue, picked, clicks, { data: students }] = await Promise.all([
    listCatalogue(),
    listPickedIds(teacher.id),
    recentClickCount(teacher.id),
    supabase.from("students").select("instrument").eq("teacher_id", teacher.id).eq("active", true),
  ]);

  // Instruments to filter by: the ones the teacher teaches first, then the rest.
  const taught = [...new Set((students ?? []).map((s) => (s.instrument ?? "").toLowerCase()).filter(Boolean))];
  const others = SUZUKI_INSTRUMENTS.map((i) => i.value).filter((v) => !taught.includes(v));
  const instrument =
    sp.instrument && SUZUKI_INSTRUMENTS.some((i) => i.value === sp.instrument)
      ? sp.instrument
      : sp.instrument === "all"
        ? ""
        : (taught[0] ?? "");
  const shown = catalogue.filter((p) => fitsInstrument(p, instrument || null));
  const pickedProducts = catalogue.filter((p) => picked.has(p.id) && fitsInstrument(p, instrument || null));
  const layout = layoutOf(teacher);

  return (
    <div className="flex flex-col gap-8">
      {sp.saved && <Notice tone="sage">Saved. Families see the change on Home practice now.</Notice>}
      {sp.error && <Notice tone="danger">That didn&apos;t save. Try again.</Notice>}

      <p className="text-[16px] text-muted">
        Pick the books, supplies and gear you want your families to buy. Each family sees the picks that fit their
        child&apos;s instrument under Home practice. When a family buys through a link, you and Lesson Studio may earn a
        commission at no extra cost to them.
      </p>

      <section>
        <SectionTitle>Instrument</SectionTitle>
        <div className="flex flex-wrap gap-2">
          {[...taught, ...others, ""].map((v) => (
            <Link
              key={v || "all"}
              href={`/store?instrument=${v || "all"}`}
              className={cx(
                "inline-flex min-h-10 items-center rounded-full border px-3.5 text-[15px] font-medium",
                v === instrument ? "border-accent bg-accent text-white" : "border-rule bg-sheet hover:border-accent/50",
                !taught.includes(v) && v !== instrument && v !== "" && "text-muted",
              )}
            >
              {v ? instrumentLabel(v) : "All instruments"}
            </Link>
          ))}
        </div>
      </section>

      <section>
        <SectionTitle>Choose products</SectionTitle>
        {catalogue.length === 0 ? (
          <Card className="text-sm text-muted">
            No products yet. They appear here once Lesson Studio loads the catalogue.
          </Card>
        ) : (
          <form action={saveStorePicks} className="flex flex-col gap-5">
            <input type="hidden" name="instrument" value={instrument} />
            {STORE_CATEGORIES.map((c) => {
              const items = shown
                .filter((p) => p.category === c.value)
                .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
              if (items.length === 0) return null;
              return (
                <div key={c.value}>
                  <h3 className="mb-1 font-semibold">{c.label}</h3>
                  <Card className="divide-y divide-rule p-0">
                    {items.map((p) => (
                      <label key={p.id} className="flex min-h-12 cursor-pointer items-start gap-3 px-4 py-2.5">
                        <input type="hidden" name="shown" value={p.id} />
                        <input
                          type="checkbox"
                          name="pick"
                          value={p.id}
                          defaultChecked={picked.has(p.id)}
                          className="mt-1 h-5 w-5 accent-[var(--color-accent)]"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="font-medium">{p.name}</span>
                          <span className="block text-sm text-muted">
                            {[p.retailer, p.price_note, p.instruments.length ? p.instruments.map(instrumentLabel).join(", ") : "All instruments"]
                              .filter(Boolean)
                              .join(" · ")}
                          </span>
                          {p.description && <span className="block text-sm text-muted">{p.description}</span>}
                        </span>
                      </label>
                    ))}
                  </Card>
                </div>
              );
            })}
            {shown.length === 0 && (
              <Card className="text-sm text-muted">Nothing in the catalogue for this instrument yet.</Card>
            )}
            {shown.length > 0 && <Button className="self-start">Save picks</Button>}
          </form>
        )}
      </section>

      <section>
        <SectionTitle>Layout</SectionTitle>
        <form action={saveStoreLayout} className="flex flex-col gap-4">
          <input type="hidden" name="instrument" value={instrument} />
          <div className="grid gap-2 sm:grid-cols-3">
            {STORE_LAYOUTS.map((l) => (
              <label
                key={l.value}
                className="flex cursor-pointer items-start gap-3 rounded-2xl border border-rule bg-sheet p-3 has-[:checked]:border-accent has-[:checked]:bg-accent-soft"
              >
                <input type="radio" name="layout" value={l.value} defaultChecked={layout === l.value} className="mt-1" />
                <span>
                  <span className="block font-semibold">{l.label}</span>
                  <span className="block text-sm text-muted">{l.hint}</span>
                </span>
              </label>
            ))}
          </div>
          <Field label="Note to families" hint="Optional. Shown at the top of the store.">
            <Textarea
              name="note"
              maxLength={300}
              defaultValue={teacher.store_note ?? ""}
              placeholder="Please have the book and a tuner before the first lesson."
            />
          </Field>
          <Button variant="secondary" className="self-start">
            Save layout
          </Button>
        </form>
      </section>

      <section>
        <SectionTitle
          action={<span className="text-sm text-muted">{clicks} Buy tap{clicks === 1 ? "" : "s"} in the last 30 days</span>}
        >
          What families see{instrument ? ` (${instrumentLabel(instrument)})` : ""}
        </SectionTitle>
        {pickedProducts.length === 0 ? (
          <Card className="text-sm text-muted">Nothing picked for this instrument yet, so families won&apos;t see a store.</Card>
        ) : (
          <StoreView products={pickedProducts} teacherId={teacher.id} layout={layout} note={teacher.store_note} preview />
        )}
      </section>
    </div>
  );
}
