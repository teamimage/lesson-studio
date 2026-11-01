"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import * as tus from "tus-js-client";
import { createClient } from "@/lib/supabase/client";
import { SCORES_BUCKET } from "@/lib/constants";
import {
  finishScore,
  startReplaceScore,
  startScore,
  type ScoreSource,
  type StartScoreResult,
} from "@/app/students/music-actions";
import type { ScorePage } from "@/lib/stand-timeline";
import { Button, cx } from "@/components/ui";

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

// The dedicated storage host handles large uploads better than the API gateway.
function resumableEndpoint(): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(/\/$/, "");
  const direct = base.replace(/^https:\/\/([a-z0-9]+)\.supabase\.co$/, "https://$1.storage.supabase.co");
  return `${direct}/storage/v1/upload/resumable`;
}
// Supabase requires 6 MB chunks for resumable uploads.
const CHUNK_SIZE = 6 * 1024 * 1024;

/** Uploads the original file in resumable chunks, so a big book survives a Wi-Fi blip. */
function uploadOriginal(file: File, path: string, onProgress: (f: number) => void): Promise<void> {
  const supabase = createClient();
  return new Promise((resolve, reject) => {
    const upload = new tus.Upload(file, {
      endpoint: resumableEndpoint(),
      retryDelays: [0, 2000, 5000, 10000, 20000],
      chunkSize: CHUNK_SIZE,
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, "x-upsert": "true" },
      metadata: { bucketName: SCORES_BUCKET, objectName: path, contentType: "application/pdf", cacheControl: "3600" },
      onBeforeRequest: async (req) => {
        const { data } = await supabase.auth.getSession();
        if (data.session) req.setHeader("authorization", `Bearer ${data.session.access_token}`);
      },
      onProgress: (sent, total) => onProgress(total ? sent / total : 0),
      onError: (err) => {
        const status = (err as tus.DetailedError).originalResponse?.getStatus();
        reject(
          new Error(
            status === 413 || status === 400
              ? "The original PDF couldn't be stored. Has sheet-music-ai.sql been run in Supabase?"
              : "Upload stopped. Check the connection and try again.",
          ),
        );
      },
      onSuccess: () => resolve(),
    });
    upload.start();
  });
}

function isPdf(f: File): boolean {
  return f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf");
}

async function pdfPages(file: File, onPage: (done: number, total: number) => void): Promise<Prepared[]> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const out: Prepared[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
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
    onPage(out.length, doc.numPages);
  }
  await doc.destroy();
  return out;
}

/** Asks Claude to read the music. Resolves when it has finished (a minute or two for a book). */
export async function readMusic(scoreId: string): Promise<{ status: string; error?: string | null }> {
  try {
    const res = await fetch(`/api/scores/${scoreId}/read`, { method: "POST" });
    if (!res.ok) return { status: "error", error: "Reading the music didn't start. Try again." };
    return await res.json();
  } catch {
    return { status: "error", error: "Lost the connection while the music was being read." };
  }
}

/**
 * Turns the chosen files into page images, uploads them (and the PDF itself,
 * kept as the original), saves the score, then has Claude read it.
 * `start` makes a new score or a fresh folder for a replacement.
 */
async function uploadMusic(
  files: File[],
  start: (fileName: string) => Promise<StartScoreResult>,
  setStatus: (s: string) => void,
  afterSave: () => void,
): Promise<{ id: string; pages: number }> {
  const prepared: Prepared[] = [];
  for (const f of files) {
    if (isPdf(f)) {
      prepared.push(...(await pdfPages(f, (d, t) => setStatus(`Reading PDF page ${d} of ${t}…`))));
    } else {
      const img = await loadImage(f);
      const canvas = draw(img.source, img.w, img.h);
      prepared.push({ blob: await canvasToJpeg(canvas), w: canvas.width, h: canvas.height });
      setStatus(`Prepared ${prepared.length} page${prepared.length === 1 ? "" : "s"}…`);
    }
  }
  if (prepared.length === 0) throw new Error("No pages found in those files.");

  const fileName = files[0].name;
  const started = await start(fileName);
  if ("error" in started) throw new Error(started.error);

  // The PDF as uploaded is kept as the original (only for a single PDF).
  const pdf = files.length === 1 && isPdf(files[0]) ? files[0] : null;
  let source: ScoreSource | null = null;
  if (pdf) {
    const path = `${started.prefix}original.pdf`;
    await uploadOriginal(pdf, path, (f) => setStatus(`Saving the original PDF… ${Math.round(f * 100)}%`));
    source = { path, name: pdf.name, size: pdf.size };
  }

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
  const res = await finishScore(started.id, pages, source, fileName);
  if (!res.ok) throw new Error("Uploaded, but couldn't be saved. Try again.");
  afterSave();

  setStatus("Claude is reading the music to find the pieces… (about a minute for a book)");
  // Show the "Reading…" state on the page while Claude works.
  setTimeout(afterSave, 2500);
  const read = await readMusic(started.id);
  if (read.status === "error") throw new Error(`Saved. ${read.error ?? "Reading the music didn't work."}`);
  return { id: started.id, pages: pages.length };
}

export function ScoreUploader({ studentId }: { studentId: string }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (files.length === 0) return setError("Choose photos or a PDF of the music.");
    setBusy(true);
    setError(null);
    try {
      const out = await uploadMusic(
        files,
        (fileName) => startScore({ studentId, fileName }),
        setStatus,
        () => router.refresh(),
      );
      setFiles([]);
      if (fileRef.current) fileRef.current.value = "";
      setStatus(`Added ${out.pages} page${out.pages === 1 ? "" : "s"}. The pieces Claude found are listed above.`);
    } catch (err) {
      setStatus(null);
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
      router.refresh();
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <label
        className={cx(
          "flex min-h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-accent/40 bg-accent-soft/50 px-4 py-5 text-center transition hover:border-accent",
          busy && "pointer-events-none opacity-60",
        )}
      >
        <span className="text-[15px] font-semibold text-accent-ink">
          {files.length ? `${files.length === 1 ? files[0].name : `${files.length} files chosen`}` : "Take photos or choose a PDF"}
        </span>
        <span className="text-sm text-muted">
          A whole book is fine. Claude reads it, names it and finds each piece and movement.
        </span>
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
      {error && <p className="text-sm text-danger">{error}</p>}
      {status && <p className="text-sm text-muted">{status}</p>}
      <Button disabled={busy || files.length === 0}>{busy ? "Working…" : "Add to music"}</Button>
    </form>
  );
}

/** Swaps a score's whole file (original and pages) for a new one, then reads it again. */
export function ReplaceScoreFile({ scoreId, title }: { scoreId: string; title: string }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onPick(list: FileList | null) {
    const files = Array.from(list ?? []);
    if (fileRef.current) fileRef.current.value = "";
    if (files.length === 0) return;
    const what = files.length === 1 ? files[0].name : `${files.length} files`;
    if (!confirm(`Replace the whole file for "${title}" with ${what}? The old file, its pages and the pieces found in it are removed.`))
      return;
    setBusy(true);
    setError(null);
    try {
      await uploadMusic(files, () => startReplaceScore(scoreId), setStatus, () => router.refresh());
      setStatus(null);
    } catch (err) {
      setStatus(null);
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
      router.refresh();
    }
  }

  return (
    <>
      <label className={cx("cursor-pointer text-accent-ink underline", busy && "pointer-events-none opacity-60")}>
        {busy ? "Replacing…" : "Replace file"}
        <input
          ref={fileRef}
          type="file"
          accept="image/*,application/pdf,.pdf"
          multiple
          className="sr-only"
          disabled={busy}
          onChange={(e) => onPick(e.target.files)}
        />
      </label>
      {(status || error) && (
        <span className={cx("basis-full text-sm", error ? "text-danger" : "text-muted")}>{error ?? status}</span>
      )}
    </>
  );
}
