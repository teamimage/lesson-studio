import { Card, cx } from "@/components/ui";
import { STORE_DISCLOSURE, buyHref, groupByCategory, type StoreProduct } from "@/lib/store";

// A teacher's studio store as families see it: the teacher's picks, grouped
// in the fixed categories, in the layout the teacher chose. Buy goes through
// our tracked link and opens the retailer in a new tab.
export function StoreView({
  products,
  teacherId,
  layout,
  note,
  preview,
}: {
  products: StoreProduct[];
  teacherId: string;
  layout: string;
  note?: string;
  /** Teacher preview: Buy links still work but say so. */
  preview?: boolean;
}) {
  const groups = groupByCategory(products);
  if (groups.length === 0) return null;
  return (
    <div className="flex flex-col gap-5">
      {note && <p className="text-[16px] italic">“{note}”</p>}
      {groups.map((g) => (
        <section key={g.category}>
          <h3 className="mb-2 text-[15px] font-semibold uppercase tracking-[0.08em] text-accent-ink">{g.label}</h3>
          {layout === "compact" ? (
            <Card className="divide-y divide-rule p-0">
              {g.items.map((p) => (
                <div key={p.id} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <span className="font-medium">{p.name}</span>
                    {p.price_note && <span className="text-sm text-muted"> · {p.price_note}</span>}
                  </div>
                  <BuyLink product={p} teacherId={teacherId} preview={preview} small />
                </div>
              ))}
            </Card>
          ) : layout === "list" ? (
            <div className="flex flex-col gap-2">
              {g.items.map((p) => (
                <Card key={p.id} className="flex items-start gap-3">
                  <Thumb product={p} className="h-16 w-16" />
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold">{p.name}</div>
                    {p.description && <div className="text-sm text-muted">{p.description}</div>}
                    <div className="mt-1 text-xs text-muted">
                      {[p.retailer, p.price_note].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  <BuyLink product={p} teacherId={teacherId} preview={preview} />
                </Card>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {g.items.map((p) => (
                <Card key={p.id} className="flex flex-col gap-2 p-3">
                  <Thumb product={p} className="aspect-square w-full" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[15px] font-semibold leading-snug">{p.name}</div>
                    <div className="mt-0.5 text-xs text-muted">
                      {[p.retailer, p.price_note].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                  <BuyLink product={p} teacherId={teacherId} preview={preview} small />
                </Card>
              ))}
            </div>
          )}
        </section>
      ))}
      <p className="text-xs text-muted">{STORE_DISCLOSURE}</p>
    </div>
  );
}

function Thumb({ product, className }: { product: StoreProduct; className?: string }) {
  if (!product.image_url) {
    return (
      <div className={cx("flex items-center justify-center rounded-xl bg-accent-soft text-2xl", className)} aria-hidden>
        ♪
      </div>
    );
  }
  return (
    // Retailer images come from many hosts, so a plain img (no Next optimizer).
    // eslint-disable-next-line @next/next/no-img-element
    <img src={product.image_url} alt="" className={cx("rounded-xl bg-white object-contain", className)} loading="lazy" />
  );
}

function BuyLink({
  product,
  teacherId,
  preview,
  small,
}: {
  product: StoreProduct;
  teacherId: string;
  preview?: boolean;
  small?: boolean;
}) {
  return (
    <a
      href={preview ? product.url : buyHref(product.id, teacherId)}
      target="_blank"
      rel="sponsored noopener noreferrer"
      className={cx(
        "inline-flex shrink-0 items-center justify-center rounded-xl bg-accent font-semibold text-white hover:bg-accent-ink",
        small ? "min-h-9 px-3 text-sm" : "min-h-11 px-4 text-[16px]",
      )}
    >
      Buy{product.retailer ? <span className="sr-only"> at {product.retailer}</span> : null}
    </a>
  );
}
