"use client";

import { useEffect, useRef, useState } from "react";
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
import { digitizePage, type Digitized } from "@/lib/digitize-page";
import { MUSIC_RIGHTS_NOTE, MUSIC_RIGHTS_STATEMENT, MUSIC_RIGHTS_VERSION } from "@/lib/music-rights";

// Long edge of a stored page image. Sharp on an iPad, small enough to load fast.
const MAX_EDGE = 2000;
const JPEG_QUALITY = 0.85;

/** A page ready to upload; photos also carry their digitized (clean) version. */
type Prepared = { blob: Blob; w: number; h: number; digital?: Digitized };

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
  start: (fileName: string, fileNames: string[]) => Promise<StartScoreResult>,
  setStatus: (s: string) => void,
  afterSave: () => void,
): Promise<{ id: string; pages: number }> {
  const prepared: Prepared[] = [];
  const photos = files.filter((f) => !isPdf(f)).length;
  let photo = 0;
  for (const f of files) {
    if (isPdf(f)) {
      prepared.push(...(await pdfPages(f, (d, t) => setStatus(`Reading PDF page ${d} of ${t}…`))));
    } else {
      photo++;
      setStatus(`Digitizing photo ${photo} of ${photos}…`);
      await new Promise((r) => setTimeout(r, 0));
      const img = await loadImage(f);
      const canvas = draw(img.source, img.w, img.h);
      const page: Prepared = { blob: await canvasToJpeg(canvas), w: canvas.width, h: canvas.height };
      // Photos are digitized straight away; if that fails the photo is used as it is.
      try {
        page.digital = await digitizePage(canvas, canvas.width, canvas.height);
      } catch (e) {
        console.error("digitize", e);
      }
      prepared.push(page);
    }
  }
  if (prepared.length === 0) throw new Error("No pages found in those files.");

  const fileName = files[0].name;
  const started = await start(
    fileName,
    files.map((f) => f.name),
  );
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
  const put = async (path: string, blob: Blob) => {
    const { error: upErr } = await supabase.storage
      .from(SCORES_BUCKET)
      .upload(path, blob, { contentType: "image/jpeg", upsert: true });
    if (upErr) throw new Error("Upload stopped. Check the connection and try again.");
  };
  const scannedAt = new Date().toISOString();
  for (const [i, p] of prepared.entries()) {
    setStatus(`Uploading page ${i + 1} of ${prepared.length}…`);
    const base = `${started.prefix}${String(i + 1).padStart(3, "0")}`;
    if (p.digital) {
      // The clean page is what shows; the photo is kept behind "Show original pictures".
      await put(`${base}-photo.jpg`, p.blob);
      await put(`${base}.jpg`, p.digital.blob);
      pages.push({
        path: `${base}.jpg`,
        w: p.digital.w,
        h: p.digital.h,
        original: { path: `${base}-photo.jpg`, w: p.w, h: p.h },
        fit: p.digital.fit,
        scanned_at: scannedAt,
        whole: !p.digital.cropped,
      });
    } else {
      await put(`${base}.jpg`, p.blob);
      pages.push({ path: `${base}.jpg`, w: p.w, h: p.h });
    }
  }
  const res = await finishScore(started.id, pages, source, fileName, started.rightsId);
  if (!res.ok) throw new Error("Uploaded, but couldn't be saved. Try again.");
  afterSave();

  setStatus("Claude is reading the music to find the pieces… (about a minute for a book)");
  // Show the "Reading…" state on the page while Claude works.
  setTimeout(afterSave, 2500);
  const read = await readMusic(started.id);
  if (read.status === "error") throw new Error(`Saved. ${read.error ?? "Reading the music didn't work."}`);
  return { id: started.id, pages: pages.length };
}

/** A small preview of a staged photo, with a button to take it out. */
function Thumb({ file, n, onRemove, disabled }: { file: File; n: number; onRemove: () => void; disabled: boolean }) {
  const img = useRef<HTMLImageElement>(null);
  const pdf = isPdf(file);
  useEffect(() => {
    if (pdf || !img.current) return;
    const u = URL.createObjectURL(file);
    img.current.src = u;
    return () => URL.revokeObjectURL(u);
  }, [file, pdf]);
  return (
    <li className="relative h-24 w-[72px] shrink-0 overflow-hidden rounded-lg border border-rule bg-white">
      {!pdf ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img ref={img} alt={`Page ${n}`} className="h-full w-full object-cover" />
      ) : (
        <span className="grid h-full place-items-center px-1 text-center text-xs text-muted">PDF</span>
      )}
      <span className="absolute bottom-0 left-0 rounded-tr-md bg-black/55 px-1.5 text-xs font-semibold text-white">
        {n}
      </span>
      {!disabled && (
        <button
          type="button"
          onClick={onRemove}
          className="absolute right-0 top-0 grid h-7 w-7 place-items-center rounded-bl-md bg-black/55 text-sm text-white"
          aria-label={`Take out page ${n}`}
        >
          ×
        </button>
      )}
    </li>
  );
}

export function ScoreUploader({ studentId }: { studentId: string }) {
  const router = useRouter();
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [owned, setOwned] = useState(false);

  const add = (list: FileList | null) => {
    const picked = Array.from(list ?? []);
    if (cameraRef.current) cameraRef.current.value = "";
    if (fileRef.current) fileRef.current.value = "";
    if (picked.length) {
      setFiles((f) => [...f, ...picked]);
      setStatus(null);
      setError(null);
    }
  };
  const photos = files.filter((f) => !isPdf(f)).length;

  async function upload() {
    if (files.length === 0) return setError("Take photos or choose a PDF of the music.");
    if (!owned) return setError("Tick the box to confirm you own this copy of the music.");
    setBusy(true);
    setError(null);
    try {
      const out = await uploadMusic(
        files,
        (fileName, fileNames) =>
          startScore({ studentId, fileName, fileNames, rights: { confirmed: owned, version: MUSIC_RIGHTS_VERSION } }),
        setStatus,
        () => router.refresh(),
      );
      setFiles([]);
      // Each upload gets its own sign-off.
      setOwned(false);
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
    <form
      onSubmit={(e) => {
        e.preventDefault();
        upload();
      }}
      className="flex flex-col gap-3"
    >
      <div className={cx("grid grid-cols-2 gap-2", busy && "pointer-events-none opacity-60")}>
        <label className="flex min-h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-accent/40 bg-accent-soft/50 px-3 py-4 text-center transition hover:border-accent">
          <span className="text-2xl" aria-hidden>
            📷
          </span>
          <span className="text-[15px] font-semibold text-accent-ink">
            {photos ? "Take another photo" : "Take photos"}
          </span>
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            disabled={busy}
            onChange={(e) => add(e.target.files)}
          />
        </label>
        <label className="flex min-h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-accent/40 bg-accent-soft/50 px-3 py-4 text-center transition hover:border-accent">
          <span className="text-2xl" aria-hidden>
            🗂
          </span>
          <span className="text-[15px] font-semibold text-accent-ink">Choose photos or a PDF</span>
          <input
            ref={fileRef}
            type="file"
            accept="image/*,application/pdf,.pdf"
            multiple
            className="sr-only"
            disabled={busy}
            onChange={(e) => add(e.target.files)}
          />
        </label>
      </div>
      <p className="-mt-1 text-sm text-muted">
        Photos are digitized into clean pages. A whole book is fine: Claude reads it, names it and finds each piece and
        movement.
      </p>

      {files.length > 0 && (
        <ul className="flex gap-2 overflow-x-auto pb-1" aria-label="Pages to add">
          {files.map((f, i) => (
            <Thumb
              key={`${f.name}-${f.lastModified}-${i}`}
              file={f}
              n={i + 1}
              disabled={busy}
              onRemove={() => setFiles((all) => all.filter((_, j) => j !== i))}
            />
          ))}
        </ul>
      )}

      <label className={cx("flex items-start gap-3 text-[15px] leading-snug", busy && "opacity-60")}>
        <input
          type="checkbox"
          className="mt-1 h-5 w-5 shrink-0 accent-[var(--accent)]"
          checked={owned}
          disabled={busy}
          onChange={(e) => {
            setOwned(e.target.checked);
            if (e.target.checked) setError(null);
          }}
        />
        <span>{MUSIC_RIGHTS_STATEMENT}</span>
      </label>
      <p className="text-sm text-muted">{MUSIC_RIGHTS_NOTE}</p>
      {error && <p className="text-sm text-danger">{error}</p>}
      {status && <p className="text-sm text-muted">{status}</p>}

      {photos > 0 && !busy ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-accent/40 bg-sheet p-3">
          <p className="text-[16px] font-semibold">Do you have any more pages to add to this piece of music?</p>
          <p className="-mt-2 text-sm text-muted">
            {files.length} page{files.length === 1 ? "" : "s"} so far.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="secondary" onClick={() => cameraRef.current?.click()}>
              Yes, add a page
            </Button>
            <Button type="submit" disabled={!owned}>
              No, upload
            </Button>
          </div>
          {!owned && <p className="text-sm text-muted">Tick the box above to upload.</p>}
        </div>
      ) : (
        <Button disabled={busy || files.length === 0 || !owned}>{busy ? "Working…" : "Add to music library"}</Button>
      )}
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
    if (
      !confirm(
        `Replace the whole file for "${title}" with ${what}? The old file, its pages and the pieces found in it are removed.\n\n` +
          `Pressing OK also confirms: ${MUSIC_RIGHTS_STATEMENT}`,
      )
    )
      return;
    setBusy(true);
    setError(null);
    try {
      await uploadMusic(
        files,
        (_fileName, fileNames) =>
          startReplaceScore(scoreId, fileNames, { confirmed: true, version: MUSIC_RIGHTS_VERSION }),
        setStatus,
        () => router.refresh(),
      );
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
