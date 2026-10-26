import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function Card({
  children,
  className,
  tone = "sheet",
}: {
  children: ReactNode;
  className?: string;
  tone?: "sheet" | "accent" | "sage" | "plum" | "amber";
}) {
  const tones = {
    sheet: "bg-sheet border-rule",
    accent: "bg-accent-soft border-accent/20",
    sage: "bg-sage-soft border-sage/20",
    plum: "bg-plum-soft border-plum/20",
    amber: "bg-amber-soft border-amber/25",
  };
  return (
    <div
      className={cx(
        "rounded-2xl border p-4 shadow-[0_1px_0_rgba(43,37,33,0.04)]",
        tones[tone],
        className,
      )}
    >
      {children}
    </div>
  );
}

export function SectionTitle({
  children,
  action,
  className,
}: {
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("mb-2 flex items-baseline justify-between gap-3", className)}>
      <h2 className="text-lg font-semibold">{children}</h2>
      {action}
    </div>
  );
}

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cx(
        "text-[11px] font-semibold uppercase tracking-[0.12em] text-accent-ink",
        className,
      )}
    >
      {children}
    </div>
  );
}

type PillTone = "accent" | "sage" | "plum" | "amber" | "muted" | "danger";
export function Pill({
  children,
  tone = "muted",
  className,
}: {
  children: ReactNode;
  tone?: PillTone;
  className?: string;
}) {
  const tones: Record<PillTone, string> = {
    accent: "bg-accent-soft text-accent-ink",
    sage: "bg-sage-soft text-sage",
    plum: "bg-plum-soft text-plum",
    amber: "bg-amber-soft text-amber",
    muted: "bg-rule/60 text-muted",
    danger: "bg-danger-soft text-danger",
  };
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

const buttonBase =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-[15px] font-semibold transition active:scale-[0.99] disabled:opacity-50";
const buttonVariants = {
  primary: "bg-accent text-white hover:bg-accent-ink",
  secondary: "border border-rule bg-sheet text-ink hover:border-accent/50",
  ghost: "text-accent-ink hover:bg-accent-soft",
  sage: "bg-sage text-white hover:opacity-90",
  plum: "bg-plum text-white hover:opacity-90",
  danger: "border border-danger/40 text-danger hover:bg-danger-soft",
};
export type ButtonVariant = keyof typeof buttonVariants;

export function Button({
  variant = "primary",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant }) {
  return (
    <button
      className={cx(buttonBase, buttonVariants[variant], className)}
      {...props}
    />
  );
}

export function LinkButton({
  variant = "primary",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: ButtonVariant }) {
  return (
    <Link
      className={cx(buttonBase, buttonVariants[variant], className)}
      {...props}
    />
  );
}

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cx("flex flex-col gap-1.5", className)}>
      <span className="text-sm font-semibold text-ink">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </label>
  );
}

export const inputClass =
  "min-h-11 w-full rounded-xl border border-rule bg-sheet px-3 py-2 text-[16px] text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/20";
export const textareaClass = cx(inputClass, "min-h-24 leading-relaxed");

export function Input(props: ComponentProps<"input">) {
  return <input {...props} className={cx(inputClass, props.className)} />;
}
export function Textarea(props: ComponentProps<"textarea">) {
  return <textarea {...props} className={cx(textareaClass, props.className)} />;
}
export function Select(props: ComponentProps<"select">) {
  return <select {...props} className={cx(inputClass, props.className)} />;
}

export function EmptyState({
  title,
  children,
  action,
}: {
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <Card className="flex flex-col items-start gap-2 border-dashed">
      <div className="font-semibold">{title}</div>
      {children && <p className="text-sm text-muted">{children}</p>}
      {action && <div className="mt-1">{action}</div>}
    </Card>
  );
}

export function Row({
  label,
  children,
}: {
  label: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="grid grid-cols-[96px_1fr] gap-x-3 gap-y-1 py-2 text-[15px] leading-relaxed sm:grid-cols-[120px_1fr]">
      <div className="pt-0.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-accent-ink">
        {label}
      </div>
      <div className="min-w-0 whitespace-pre-line">{children}</div>
    </div>
  );
}

export function Notice({
  tone = "amber",
  children,
}: {
  tone?: "amber" | "sage" | "danger" | "plum";
  children: ReactNode;
}) {
  const tones = {
    amber: "bg-amber-soft text-ink border-amber/30",
    sage: "bg-sage-soft text-ink border-sage/30",
    danger: "bg-danger-soft text-ink border-danger/30",
    plum: "bg-plum-soft text-ink border-plum/30",
  };
  return (
    <div className={cx("rounded-xl border px-3 py-2 text-sm", tones[tone])}>
      {children}
    </div>
  );
}
