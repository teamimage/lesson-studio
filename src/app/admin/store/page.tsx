import { Suspense } from "react";
import { Shell } from "@/components/shell";
import { AdminNotices } from "@/components/admin-ui";
import { ConfirmButton } from "@/components/confirm-button";
import { Button, Card, Field, Input, Pill, SectionTitle, Select, Textarea } from "@/components/ui";
import { requireAdmin } from "@/lib/admin";
import { SUZUKI_INSTRUMENTS, instrumentLabel } from "@/lib/constants";
import { RETAILERS, STORE_CATEGORIES, categoryLabel, daysAgoISO, type StoreProduct } from "@/lib/store";
import { adminAddProduct, adminDeleteProduct, adminUpdateProduct } from "./actions";

type SP = Promise<{ saved?: string; deleted?: string; error?: string }>;

export default function AdminStorePage({ searchParams }: { searchParams: SP }) {
  return (
    <Shell title="Store products" eyebrow="Admin" back={{ href: "/admin", label: "Admin" }} wide>
      <Suspense>
        <Body searchParams={searchParams} />
      </Suspense>
    </Shell>
  );
}

async function Body({ searchParams }: { searchParams: SP }) {
  const { db } = await requireAdmin();
  const sp = await searchParams;
  const [{ data: products, error }, { data: picks }, { data: clicks }] = await Promise.all([
    db.from("store_products").select("*").order("category").order("sort_order").order("name"),
    db.from("teacher_store_items").select("product_id"),
    db.from("store_clicks").select("product_id").gte("created_at", daysAgoISO(30)),
  ]);
  if (error) {
    return (
      <Card tone="amber">
        The store tables aren&apos;t set up yet. Run <b>studio-store.sql</b> in the Supabase SQL Editor, then reload.
      </Card>
    );
  }
  const pickCount = countBy((picks ?? []).map((p) => p.product_id));
  const clickCount = countBy((clicks ?? []).map((c) => c.product_id ?? ""));
  const all = products ?? [];

  return (
    <div className="flex flex-col gap-8">
      <AdminNotices sp={sp} />
      <p className="text-sm text-muted">
        The catalogue every teacher picks from. Teachers can&apos;t add products or change categories; they tick
        products on and off by instrument and choose a layout. Leave instruments empty for items that suit everyone
        (stands, practice logs). Tick &ldquo;Affiliate link&rdquo; only when the link carries your affiliate ID.
      </p>

      <datalist id="retailers">
        {RETAILERS.map((r) => (
          <option key={r} value={r} />
        ))}
      </datalist>

      <section id="add" className="scroll-mt-24">
        <SectionTitle>Add a product</SectionTitle>
        <Card>
          <form action={adminAddProduct} className="flex flex-col gap-4">
            <ProductFields />
            <Button className="self-start">Add product</Button>
          </form>
        </Card>
      </section>

      {STORE_CATEGORIES.map((c) => {
        const items = all.filter((p) => p.category === c.value);
        return (
          <section key={c.value}>
            <SectionTitle action={<span className="text-sm text-muted">{items.length}</span>}>{c.label}</SectionTitle>
            {items.length === 0 ? (
              <p className="text-sm text-muted">None yet. {c.hint}.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {items.map((p) => (
                  <details key={p.id} className="rounded-2xl border border-rule bg-sheet">
                    <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 px-4 py-3 [&::-webkit-details-marker]:hidden">
                      <span className="min-w-0 flex-1">
                        <span className="font-semibold">{p.name}</span>
                        <span className="block text-sm text-muted">
                          {[
                            p.retailer,
                            p.price_note,
                            p.instruments.length ? p.instruments.map(instrumentLabel).join(", ") : "All instruments",
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </span>
                      {p.affiliate ? <Pill tone="sage">Affiliate link</Pill> : <Pill tone="amber">Plain link</Pill>}
                      {!p.active && <Pill tone="muted">Hidden</Pill>}
                      <Pill tone="accent">{pickCount.get(p.id) ?? 0} teachers</Pill>
                      <Pill tone="plum">{clickCount.get(p.id) ?? 0} taps / 30 days</Pill>
                    </summary>
                    <div className="border-t border-rule px-4 pb-4 pt-3">
                      <form action={adminUpdateProduct} className="flex flex-col gap-4">
                        <input type="hidden" name="id" value={p.id} />
                        <ProductFields product={p} />
                        <div className="flex flex-wrap gap-2">
                          <Button>Save</Button>
                          <a href={p.url} target="_blank" rel="noopener noreferrer" className="self-center text-sm text-accent-ink underline">
                            Open link
                          </a>
                        </div>
                      </form>
                      <form action={adminDeleteProduct} className="mt-3">
                        <input type="hidden" name="id" value={p.id} />
                        <ConfirmButton
                          message={`Delete “${p.name}”? It disappears from every teacher's store. To hide it for now, untick Show in stores instead.`}
                          variant="danger"
                          className="min-h-9 px-3 text-sm"
                        >
                          Delete
                        </ConfirmButton>
                      </form>
                    </div>
                  </details>
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function ProductFields({ product }: { product?: StoreProduct }) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Category">
          <Select name="category" defaultValue={product?.category ?? "books"} required>
            {STORE_CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {categoryLabel(c.value)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Product name">
          <Input name="name" defaultValue={product?.name} required maxLength={200} placeholder="Suzuki Cello School, Volume 1" />
        </Field>
        <Field label="Link" hint="The retailer link with your affiliate ID. Must start with https://">
          <Input name="url" type="url" defaultValue={product?.url} required placeholder="https://" />
        </Field>
        <Field label="Retailer">
          <Input name="retailer" list="retailers" defaultValue={product?.retailer} placeholder="Shar Music" />
        </Field>
        <Field label="Picture link" hint="Optional. An https image address.">
          <Input name="image_url" type="url" defaultValue={product?.image_url ?? ""} placeholder="https://" />
        </Field>
        <Field label="Price note" hint="Optional, e.g. “about $15”.">
          <Input name="price_note" defaultValue={product?.price_note} maxLength={60} />
        </Field>
      </div>
      <Field label="Description" hint="Optional. One or two lines for teachers and families.">
        <Textarea name="description" defaultValue={product?.description} maxLength={500} />
      </Field>
      <fieldset>
        <legend className="mb-1.5 text-[15px] font-medium">Instruments (none ticked = all instruments)</legend>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {SUZUKI_INSTRUMENTS.map((i) => (
            <label key={i.value} className="flex items-center gap-1.5 text-[15px]">
              <input type="checkbox" name="instruments" value={i.value} defaultChecked={product?.instruments.includes(i.value)} />
              {i.label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <label className="flex items-center gap-1.5 text-[15px]">
          <input type="checkbox" name="affiliate" defaultChecked={product?.affiliate ?? false} />
          Affiliate link
        </label>
        <label className="flex items-center gap-1.5 text-[15px]">
          <input type="checkbox" name="active" defaultChecked={product?.active ?? true} />
          Show in stores
        </label>
        <label className="flex items-center gap-1.5 text-[15px]">
          Order
          <Input name="sort_order" type="number" defaultValue={product?.sort_order ?? 0} className="w-20" />
        </label>
      </div>
    </>
  );
}

function countBy(ids: string[]) {
  const m = new Map<string, number>();
  for (const id of ids) m.set(id, (m.get(id) ?? 0) + 1);
  return m;
}
