import type { ReactNode } from "react";
import { adminDelete, adminUpdate } from "@/app/admin/actions";
import { ADMIN_FIELDS, type AdminTable, type FieldSpec } from "@/lib/admin-fields";
import { ConfirmButton } from "@/components/confirm-button";
import { InstrumentBookFields } from "@/components/instrument-book-fields";
import { Button, Field, Input, Notice, Select, Textarea, cx } from "@/components/ui";

/** Edit form for one row, built from ADMIN_FIELDS. */
export function AdminEditForm({
  table,
  row,
  back,
  only,
  compact,
  submitLabel = "Save",
}: {
  table: AdminTable;
  row: Record<string, unknown> & { id: string };
  back: string;
  /** Limit to these columns. */
  only?: string[];
  compact?: boolean;
  submitLabel?: string;
}) {
  const specs = Object.entries(ADMIN_FIELDS[table] as Record<string, FieldSpec>).filter(
    ([k]) => !only || only.includes(k),
  );
  return (
    <form action={adminUpdate} className={cx("flex flex-col", compact ? "gap-2" : "gap-4")}>
      <input type="hidden" name="_table" value={table} />
      <input type="hidden" name="_id" value={row.id} />
      <input type="hidden" name="_back" value={back} />
      <div className={cx("grid gap-3", compact ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1 sm:grid-cols-2")}>
        {specs.map(([key, spec]) => (
          <FieldInput key={key} name={key} spec={spec} value={row[key]} row={row} />
        ))}
      </div>
      <div>
        <Button variant={compact ? "secondary" : "primary"} className={compact ? "min-h-9 text-sm" : ""}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

function FieldInput({
  name,
  spec,
  value,
  row,
}: {
  name: string;
  spec: FieldSpec;
  value: unknown;
  row: Record<string, unknown>;
}) {
  const v = value == null ? "" : String(value);
  if (spec.kind === "instrument") {
    return (
      <InstrumentBookFields
        instrument={v}
        currentBook={typeof row.current_book === "string" ? row.current_book : null}
      />
    );
  }
  if (spec.kind === "book") return null;
  if (spec.kind === "bool") {
    return (
      <label className="flex min-h-11 items-center gap-3 text-[15px] sm:col-span-2">
        <input type="hidden" name={name} value="off" />
        <input
          type="checkbox"
          name={name}
          value="on"
          defaultChecked={value === true}
          className="h-5 w-5 accent-[var(--accent)]"
        />
        {spec.label}
      </label>
    );
  }
  if (spec.kind === "longtext") {
    return (
      <Field label={spec.label} className="sm:col-span-2">
        <Textarea name={name} defaultValue={v} rows={3} />
      </Field>
    );
  }
  if (spec.kind === "select") {
    return (
      <Field label={spec.label}>
        <Select name={name} defaultValue={v}>
          {!spec.required && <option value="">—</option>}
          {spec.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </Field>
    );
  }
  const type = spec.kind === "int" ? "number" : spec.kind === "date" ? "date" : spec.kind === "email" ? "email" : "text";
  return (
    <Field label={spec.label}>
      <Input name={name} type={type} defaultValue={v} required={spec.required} />
    </Field>
  );
}

/** Delete button with a confirm prompt. */
export function AdminDeleteButton({
  table,
  id,
  back,
  label = "Delete",
  confirm,
}: {
  table: AdminTable;
  id: string;
  back: string;
  label?: string;
  confirm: string;
}) {
  return (
    <form action={adminDelete}>
      <input type="hidden" name="_table" value={table} />
      <input type="hidden" name="_id" value={id} />
      <input type="hidden" name="_back" value={back} />
      <ConfirmButton message={confirm} variant="danger" className="min-h-9 px-3 text-sm">
        {label}
      </ConfirmButton>
    </form>
  );
}

export function AdminNotices({ sp }: { sp: { saved?: string; deleted?: string; error?: string } }) {
  if (sp.error === "self") return <Notice tone="danger">You can&apos;t delete your own account here.</Notice>;
  if (sp.error) return <Notice tone="danger">That didn&apos;t save. Check the fields and try again.</Notice>;
  if (sp.deleted) return <Notice tone="sage">Deleted.</Notice>;
  if (sp.saved) return <Notice tone="sage">Saved.</Notice>;
  return null;
}

/** Collapsible section so long lists don't crowd the page. */
export function Fold({
  title,
  count,
  open,
  children,
}: {
  title: ReactNode;
  count?: number;
  open?: boolean;
  children: ReactNode;
}) {
  return (
    <details open={open} className="group rounded-2xl border border-rule bg-sheet">
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-4 font-semibold">
        <span className="text-accent-ink transition group-open:rotate-90" aria-hidden>
          ›
        </span>
        <span className="flex-1">{title}</span>
        {count !== undefined && <span className="text-sm font-normal text-muted">{count}</span>}
      </summary>
      <div className="flex flex-col gap-3 border-t border-rule p-4">{children}</div>
    </details>
  );
}
