// Small date helpers. Dates in the database are ISO strings (YYYY-MM-DD).

export function todayISO(): string {
  // Use the server's local date. Good enough for a single-timezone pilot.
  const d = new Date();
  return toISODate(d);
}

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseISODate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(iso: string, n: number): string {
  const d = parseISODate(iso);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

export function daysBetween(a: string, b: string): number {
  const ms = parseISODate(b).getTime() - parseISODate(a).getTime();
  return Math.round(ms / 86_400_000);
}

export function formatDate(
  iso: string | null | undefined,
  style: "short" | "long" | "weekday" = "short",
): string {
  if (!iso) return "";
  const d = parseISODate(iso);
  if (style === "long")
    return d.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  if (style === "weekday")
    return d.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function relativeDay(iso: string, today = todayISO()): string {
  const n = daysBetween(iso, today);
  if (n === 0) return "today";
  if (n === 1) return "yesterday";
  if (n === -1) return "tomorrow";
  if (n > 1 && n < 7) return `${n} days ago`;
  if (n < -1 && n > -7) return `in ${-n} days`;
  return formatDate(iso);
}

export function capitalize(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

export function humanize(s: string): string {
  return capitalize(s.replace(/_/g, " "));
}

export function formatBytes(n: number): string {
  if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GB`;
  if (n >= 1024 ** 2) return `${Math.round(n / 1024 ** 2)} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}

export function formatDuration(seconds: number): string {
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}
