"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import * as tus from "tus-js-client";
import { createClient } from "@/lib/supabase/client";
import { Button, Input, Select, cx, inputClass } from "@/components/ui";
import { addReferenceLink, finishReferenceUpload, startReferenceUpload } from "@/app/students/reference-actions";
import {
  AUDIO_ACCEPT,
  REFERENCE_BUCKET,
  formatDuration,
  guessFromFileName,
  isAudioFile,
  type BookChoice,
} from "@/lib/reference-recordings";
import { REFERENCE_RIGHTS_NOTE, REFERENCE_RIGHTS_STATEMENT, REFERENCE_RIGHTS_VERSION } from "@/lib/reference-rights";
import { formatBytes } from "@/lib/format";

// The dedicated storage host handles large uploads better than the API gateway.
function resumableEndpoint(): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(/\/$/, "");
  const direct = base.replace(/^https:\/\/([a-z0-9]+)\.supabase\.co$/, "https://$1.storage.supabase.co");
  return `${direct}/storage/v1/upload/resumable`;
}
// Supabase requires 6 MB chunks for resumable uploads.
const CHUNK_SIZE = 6 * 1024 * 1024;
const OTHER = "__other__";

/** Uploads one track in resumable chunks, so an album survives a Wi-Fi blip. */
function uploadTrack(file: File, path: string, contentType: string, onProgress: (f: number) => void): Promise<void> {
  const supabase = createClient();
  return new Promise((resolve, reject) => {
    const upload = new tus.Upload(file, {
      endpoint: resumableEndpoint(),
      retryDelays: [0, 2000, 5000, 10000, 20000],
      chunkSize: CHUNK_SIZE,
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, "x-upsert": "true" },
      metadata: { bucketName: REFERENCE_BUCKET, objectName: path, contentType, cacheControl: "3600" },
      onBeforeRequest: async (req) => {
        const { data } = await supabase.auth.getSession();
        if (data.session) req.setHeader("authorization", `Bearer ${data.session.access_token}`);
      },
      onProgress: (sent, total) => onProgress(total ? sent / total : 0),
      onError: (err) => {
        const status = (err as tus.DetailedError).originalResponse?.getStatus();
        reject(
          new Error(
            status === 413
              ? `${file.name} is too big (200 MB per track).`
              : status === 400 || status === 404
                ? "The recording couldn't be stored. Has reference-recordings.sql been run in Supabase?"
                : status === 401 || status === 403
                  ? "Storage refused the file. Sign in again, then retry."
                  : "Upload stopped. Check the connection and try again.",
          ),
        );
      },
      onSuccess: () => resolve(),
    });
    upload.start();
  });
}

/** Length of an audio file in seconds, read in the browser (null if it can't tell). */
function readDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = document.createElement("audio");
    const done = (v: number | null) => {
      URL.revokeObjectURL(url);
      resolve(v);
    };
    const timer = setTimeout(() => done(null), 8000);
    audio.preload = "metadata";
    audio.onloadedmetadata = () => {
      clearTimeout(timer);
      done(Number.isFinite(audio.duration) ? audio.duration : null);
    };
    audio.onerror = () => {
      clearTimeout(timer);
      done(null);
    };
    audio.src = url;
  });
}

type Picked = { file: File; title: string; trackNo: string; duration: number | null; progress: number; state: "" | "up" | "ok" | "err" };

/**
 * Adds reference recordings (audio files, a whole album at once) filed under
 * a book, with a track number and title for each. Track titles are guessed
 * from the file names and the book's track list, and can be fixed before upload.
 */
export function ReferenceUploader({
  instrument,
  books,
  defaultBook,
  studentId,
}: {
  instrument: string;
  books: BookChoice[];
  defaultBook?: string | null;
  studentId?: string;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const initialBook = defaultBook && books.some((b) => b.book === defaultBook) ? defaultBook : (books[0]?.book ?? OTHER);
  const [bookSel, setBookSel] = useState(initialBook);
  const [otherBook, setOtherBook] = useState("");
  const [picked, setPicked] = useState<Picked[]>([]);
  const [owned, setOwned] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const choice = books.find((b) => b.book === bookSel) ?? null;
  const tracks = choice?.tracks ?? [];
  const book = bookSel === OTHER ? otherBook.trim() : bookSel;

  async function onPick(list: FileList | null) {
    const files = Array.from(list ?? []).filter(isAudioFile);
    setError(files.length || !list?.length ? null : "Those aren't audio files. Choose mp3, m4a, aac or wav.");
    const sorted = files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    const rows: Picked[] = sorted.map((file) => {
      const g = guessFromFileName(file.name, tracks);
      return { file, title: g.title, trackNo: g.track_no ? String(g.track_no) : "", duration: null, progress: 0, state: "" };
    });
    setPicked(rows);
    setStatus(null);
    const durations = await Promise.all(sorted.map(readDuration));
    setPicked((ps) => ps.map((p, i) => (p.file === sorted[i] ? { ...p, duration: durations[i] } : p)));
  }

  function retitle(newBook: string) {
    setBookSel(newBook);
    const list = books.find((b) => b.book === newBook)?.tracks ?? [];
    setPicked((ps) =>
      ps.map((p) => {
        const g = guessFromFileName(p.file.name, list);
        return { ...p, title: g.title, trackNo: g.track_no ? String(g.track_no) : p.trackNo };
      }),
    );
  }

  function update(i: number, patch: Partial<Picked>) {
    setPicked((ps) => ps.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!picked.length) return setError("Choose one or more audio files.");
    if (!owned) return setError("Tick the box to confirm you own this recording.");
    setBusy(true);
    setError(null);
    try {
      const started = await startReferenceUpload({
        instrument,
        book,
        scoreId: choice?.scoreId ?? null,
        studentId,
        rights: { confirmed: owned, version: REFERENCE_RIGHTS_VERSION },
        tracks: picked.map((p) => ({
          fileName: p.file.name,
          size: p.file.size,
          type: p.file.type,
          title: p.title.trim(),
          trackNo: p.trackNo ? Number(p.trackNo) : null,
          durationSeconds: p.duration,
        })),
      });
      if ("error" in started) throw new Error(started.error);
      router.refresh();
      let failed = 0;
      let firstError: string | null = null;
      // One at a time: phones and iPads cope better than with many uploads at once.
      for (const [i, t] of started.tracks.entries()) {
        const p = picked[i];
        setStatus(`Uploading ${i + 1} of ${started.tracks.length}: ${p.title}`);
        update(i, { state: "up" });
        try {
          await uploadTrack(p.file, t.path, t.contentType, (f) => update(i, { progress: f }));
          await finishReferenceUpload(t.id, true, studentId);
          update(i, { state: "ok", progress: 1 });
        } catch (err) {
          failed++;
          firstError ??= err instanceof Error ? err.message : "Upload stopped.";
          await finishReferenceUpload(t.id, false, studentId);
          update(i, { state: "err" });
        }
      }
      const ok = started.tracks.length - failed;
      if (failed) {
        setError(`${ok} added, ${failed} didn't upload. ${firstError ?? ""}`.trim());
        setPicked((ps) => ps.filter((p) => p.state === "err").map((p) => ({ ...p, state: "", progress: 0 })));
      } else {
        setPicked([]);
        if (fileRef.current) fileRef.current.value = "";
      }
      setStatus(ok ? `Added ${ok} recording${ok === 1 ? "" : "s"}.` : null);
      // Each upload gets its own sign-off.
      setOwned(false);
    } catch (err) {
      setStatus(null);
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
      router.refresh();
    }
  }

  const listId = `tracks-${instrument}`;
  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <datalist id={listId}>
        {tracks.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium">Book or collection</span>
        <Select value={bookSel} onChange={(e) => retitle(e.target.value)} disabled={busy}>
          {books.map((b) => (
            <option key={b.book} value={b.book}>
              {b.book}
            </option>
          ))}
          <option value={OTHER}>Other (type a name) or no book</option>
        </Select>
      </label>
      {bookSel === OTHER && (
        <Input
          placeholder="e.g. Essential Elements Book 1, or leave empty"
          value={otherBook}
          onChange={(e) => setOtherBook(e.target.value)}
          disabled={busy}
        />
      )}

      <label
        className={cx(
          "flex min-h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-plum/40 bg-plum-soft/50 px-4 py-5 text-center transition hover:border-plum",
          busy && "pointer-events-none opacity-60",
        )}
      >
        <span className="text-[16px] font-semibold text-plum">
          {picked.length ? `${picked.length} track${picked.length === 1 ? "" : "s"} chosen` : "Choose audio files"}
        </span>
        <span className="text-sm text-muted">
          mp3, m4a, aac or wav. Pick a whole album at once; each file becomes one track.
        </span>
        <input
          ref={fileRef}
          type="file"
          accept={AUDIO_ACCEPT}
          multiple
          className="sr-only"
          disabled={busy}
          onChange={(e) => onPick(e.target.files)}
        />
      </label>

      {picked.length > 0 && (
        <ol className="flex flex-col divide-y divide-rule overflow-hidden rounded-2xl border border-rule bg-sheet">
          {picked.map((p, i) => (
            <li key={`${p.file.name}-${i}`} className="flex flex-col gap-1 px-3 py-2">
              <div className="flex items-center gap-2">
                <input
                  className={cx(inputClass, "w-14 shrink-0 px-2 text-center")}
                  inputMode="numeric"
                  placeholder="#"
                  aria-label="Track number"
                  value={p.trackNo}
                  disabled={busy}
                  onChange={(e) => update(i, { trackNo: e.target.value.replace(/\D/g, "").slice(0, 3) })}
                />
                <input
                  className={cx(inputClass, "min-w-0 flex-1")}
                  list={listId}
                  aria-label="Title"
                  value={p.title}
                  disabled={busy}
                  onChange={(e) => update(i, { title: e.target.value })}
                />
                {!busy && (
                  <button
                    type="button"
                    className="shrink-0 px-1 text-lg text-muted"
                    aria-label={`Leave out ${p.file.name}`}
                    onClick={() => setPicked((ps) => ps.filter((_, j) => j !== i))}
                  >
                    ×
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2 text-xs text-muted">
                <span className="min-w-0 truncate">{p.file.name}</span>
                <span className="shrink-0">
                  {[formatDuration(p.duration), formatBytes(p.file.size)].filter(Boolean).join(" · ")}
                </span>
                <span className="ml-auto shrink-0 font-medium">
                  {p.state === "ok" ? (
                    <span className="text-sage">✓ added</span>
                  ) : p.state === "err" ? (
                    <span className="text-danger">didn&apos;t upload</span>
                  ) : p.state === "up" ? (
                    `${Math.round(p.progress * 100)}%`
                  ) : null}
                </span>
              </div>
            </li>
          ))}
        </ol>
      )}

      <label className={cx("flex items-start gap-3 text-[15px] leading-snug", busy && "opacity-60")}>
        <input
          type="checkbox"
          className="mt-1 h-5 w-5 shrink-0 accent-[var(--plum)]"
          checked={owned}
          disabled={busy}
          onChange={(e) => {
            setOwned(e.target.checked);
            if (e.target.checked) setError(null);
          }}
        />
        <span>{REFERENCE_RIGHTS_STATEMENT}</span>
      </label>
      <p className="text-sm text-muted">{REFERENCE_RIGHTS_NOTE}</p>
      {error && <p className="text-sm text-danger">{error}</p>}
      {status && <p className="text-sm text-muted">{status}</p>}
      <Button variant="plum" disabled={busy || picked.length === 0 || !owned}>
        {busy
          ? "Uploading…"
          : picked.length
            ? `Add ${picked.length} recording${picked.length === 1 ? "" : "s"}`
            : "Add recordings"}
      </Button>
    </form>
  );
}

/** A recording that lives elsewhere: a streaming page or a shared drive link. */
export function ReferenceLinkForm({
  instrument,
  books,
  studentId,
}: {
  instrument: string;
  books: BookChoice[];
  studentId?: string;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [bookSel, setBookSel] = useState(books[0]?.book ?? "");
  const tracks = books.find((b) => b.book === bookSel)?.tracks ?? [];
  const listId = `link-tracks-${instrument}`;

  return (
    <form
      ref={formRef}
      action={(fd) =>
        start(async () => {
          setSaved(false);
          const res = await addReferenceLink(fd);
          if (res.error) return setError(res.error);
          setError(null);
          setSaved(true);
          formRef.current?.reset();
          router.refresh();
        })
      }
      className="flex flex-col gap-2"
    >
      <input type="hidden" name="instrument" value={instrument} />
      {studentId && <input type="hidden" name="student_id" value={studentId} />}
      <datalist id={listId}>
        {tracks.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
      <Input name="url" type="url" inputMode="url" placeholder="https://… (YouTube, Spotify, a shared drive)" required />
      <div className="flex gap-2">
        <Select name="book" value={bookSel} onChange={(e) => setBookSel(e.target.value)} className="min-w-0 flex-1">
          {books.map((b) => (
            <option key={b.book} value={b.book}>
              {b.book}
            </option>
          ))}
          <option value="">No book</option>
        </Select>
        <input name="track_no" className={cx(inputClass, "w-16 px-2 text-center")} inputMode="numeric" placeholder="#" aria-label="Track number" />
      </div>
      <input name="title" className={inputClass} list={listId} placeholder="Title, e.g. Gavotte (Gossec)" required />
      <label className="flex items-start gap-3 text-[15px] leading-snug">
        <input type="checkbox" name="rights" className="mt-1 h-5 w-5 shrink-0 accent-[var(--plum)]" required />
        <span>{REFERENCE_RIGHTS_STATEMENT}</span>
      </label>
      <p className="text-xs text-muted">
        A link opens in its own app or tab, so the family ticks it off by hand. Uploaded files tick themselves off when
        played through.
      </p>
      {error && <p className="text-sm text-danger">{error}</p>}
      {saved && <p className="text-sm text-sage">Link added.</p>}
      <Button variant="secondary" disabled={pending}>
        {pending ? "Adding…" : "Add link"}
      </Button>
    </form>
  );
}
