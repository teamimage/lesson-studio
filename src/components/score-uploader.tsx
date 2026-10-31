"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { SCORES_BUCKET, SCORE_KINDS } from "@/lib/constants";
import { finishScore, startScore } from "@/app/students/music-actions";
import type { ScorePage } from "@/lib/stand-timeline";
import { Button, Field, Input, Select, cx } from "@/components/ui";

// Long edge of a stored page image. Sharp on an iPad, small enough to load fast.
const MAX_EDGE = 2000;
const JPEG_QUALITY = 0.85;

type Prepared = { blob: Blob; w: number; h: number };

function canvasToJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode"))), "image/jpeg", JPEG_QUALITY),
  );
}

function draw(source: CanvasImageSource, w: number, h: number): HTMLCanvasElement {
  const scale = Math.min(1, MAX_EDGE / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

async function loadImage(file: File): Promise<{ source: CanvasImageSource; w: number; h: number }> {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    return { source: bmp, w: bmp.width, h: bmp.height };
  } catch {
    // Older Safari: decode through an <img>, which also applies photo rotation.
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.src = url;
    await img.decode();
    URL.revokeObjectURL(url);
    return { source: img, w: img.naturalWidth, h: img.naturalHeight };
  }
}

/** "3-5, 8" -> [3,4,5,8]; empty -> all pages. */
function parseRange(text: string, count: number): number[] {
  const all = Array.from({ length: count }, (_, i) => i + 1);
  if (!text.trim()) return all;
  const out = new Set<number>();
  for (const part of text.split(/[,\s]+/).filter(Boolean)) {
    const [a, b] = part.split("-").map((n) => parseInt(n, 10));
    if (!Number.isFinite(a)) continue;
    for (let p = a; p <= (Number.isFinite(b) ? b : a); p++) if (p >= 1 && p <= count) out.add(p);
  }
  return out.size ? [...out].sort((x, y) => x - y) : all;
}

async function pdfPages(file: File, range: string, onPage: (done: number, total: number) => void): Promise<Prepared[]> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const wanted = parseRange(range, doc.numPages);
  const out: Prepared[] = [];
  for (const n of wanted) {
    const page = await doc.getPage(n);
    const base = page.getViewport({ scale: 1 });
    const scale = MAX_EDGE / Math.max(base.width, base.height);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvas, canvasContext: ctx, viewport }).promise;
    out.push({ blob: await canvasToJpeg(canvas), w: canvas.width, h: canvas.height });
    onPage(out.length, wanted.length);
  }
  await doc.destroy();
  return out;
}

export function ScoreUploader({ studentId, suggestions }: { studentId: string; suggestions: string[] }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState("piece");
  const [range, setRange] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const hasPdf = files.some((f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return setError("Give the music a name first.");
    if (files.length === 0) return setError("Choose photos or a PDF of the music.");
    setBusy(true);
    setError(null);
    try {
      setStatus("Preparing pages…");
      const prepared: Prepared[] = [];
      for (const f of files) {
        if (f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf")) {
          prepared.push(...(await pdfPages(f, range, (d, t) => setStatus(`Reading PDF page ${d} of ${t}…`))));
        } else {
          const img = await loadImage(f);
          const canvas = draw(img.source, img.w, img.h);
          prepared.push({ blob: await canvasToJpeg(canvas), w: canvas.width, h: canvas.height });
          setStatus(`Prepared ${prepared.length} page${prepared.length === 1 ? "" : "s"}…`);
        }
      }
      if (prepared.length === 0) throw new Error("No pages found in those files.");

      const started = await startScore({ studentId, title, kind });
      if ("error" in started) throw new Error(started.error);
      const supabase = createClient();
      const pages: ScorePage[] = [];
      for (const [i, p] of prepared.entries()) {
        setStatus(`Uploading page ${i + 1} of ${prepared.length}…`);
        const path = `${started.prefix}${String(i + 1).padStart(3, "0")}.jpg`;
        const { error: upErr } = await supabase.storage
          .from(SCORES_BUCKET)
          .upload(path, p.blob, { contentType: "image/jpeg", upsert: true });
        if (upErr) throw new Error("Upload stopped. Check the connection and try again.");
        pages.push({ path, w: p.w, h: p.h });
      }
      const res = await finishScore(started.id, pages);
      if (!res.ok) throw new Error("Uploaded, but couldn't be saved. Try again.");
      setTitle("");
      setRange("");
      setFiles([]);
      if (fileRef.current) fileRef.current.value = "";
      setStatus(`Added "${title.trim()}" (${pages.length} page${pages.length === 1 ? "" : "s"}).`);
      router.refresh();
    } catch (err) {
      setStatus(null);
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <Field label="Name" hint="Use the piece's name, e.g. Twinkle Variation A, so it matches the repertoire map.">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          list="score-title-suggestions"
          placeholder="e.g. Lightly Row"
          disabled={busy}
        />
        <datalist id="score-title-suggestions">
          {suggestions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </Field>
      <Field label="Kind">
        <Select value={kind} onChange={(e) => setKind(e.target.value)} disabled={busy}>
          {SCORE_KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </Select>
      </Field>
      <label
        className={cx(
          "flex min-h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-accent/40 bg-accent-soft/50 px-4 py-5 text-center transition hover:border-accent",
          busy && "pointer-events-none opacity-60",
        )}
      >
        <span className="text-[15px] font-semibold text-accent-ink">
          {files.length ? `${files.length} file${files.length === 1 ? "" : "s"} chosen` : "Take photos or choose a PDF"}
        </span>
        <span className="text-sm text-muted">One photo per page, in order. Or one PDF.</span>
        <input
          ref={fileRef}
          type="file"
          accept="image/*,application/pdf,.pdf"
          multiple
          className="sr-only"
          disabled={busy}
          onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
        />
      </label>
      {hasPdf && (
        <Field label="Which PDF pages" hint="Leave empty for all pages, or type e.g. 12-13 for just this piece.">
          <Input value={range} onChange={(e) => setRange(e.target.value)} placeholder="All pages" disabled={busy} />
        </Field>
      )}
      {error && <p className="text-sm text-danger">{error}</p>}
      {status && <p className="text-sm text-muted">{status}</p>}
      <Button disabled={busy}>{busy ? "Working…" : "Add to music"}</Button>
    </form>
  );
}
