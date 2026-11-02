"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { instrumentIcon, instrumentLabel } from "@/lib/constants";
import { shrinkPhoto } from "@/lib/shrink-photo";
import { updateStudentPhoto } from "@/app/students/actions";
import { cx } from "./ui";

const SIZES = {
  sm: "h-8 w-8 text-base",
  md: "h-12 w-12 text-2xl",
  lg: "h-16 w-16 text-3xl",
};

/**
 * Round picture of the student. Shows their photo when there is one, and
 * the instrument otherwise. Tapping a photo opens it large. With
 * `editStudentId`, the large view also lets the teacher take, choose or
 * remove the photo (and tapping works even when there is no photo yet).
 */
export function Avatar({
  name,
  instrument,
  photoSrc,
  size = "md",
  editStudentId,
  className,
}: {
  name: string;
  instrument: string;
  photoSrc?: string | null;
  size?: keyof typeof SIZES;
  editStudentId?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const clickable = !!photoSrc || !!editStudentId;
  const face = (
    <AvatarFace name={name} instrument={instrument} photoSrc={photoSrc} className={cx(SIZES[size], className)} />
  );
  if (!clickable) return face;
  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          // Avatars can sit inside a link card; open the photo instead.
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        aria-label={photoSrc ? `Show ${name}'s photo` : `Add a photo of ${name}`}
        className="shrink-0 rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        {face}
      </button>
      {open && (
        <PhotoLightbox
          name={name}
          instrument={instrument}
          photoSrc={photoSrc ?? null}
          editStudentId={editStudentId}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

export function AvatarFace({
  name,
  instrument,
  photoSrc,
  className,
}: {
  name: string;
  instrument: string;
  photoSrc?: string | null;
  className?: string;
}) {
  if (photoSrc) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photoSrc}
        alt={name}
        className={cx("shrink-0 rounded-full bg-accent-soft object-cover object-[50%_30%] ring-2 ring-sheet", className ?? SIZES.md)}
      />
    );
  }
  return (
    <span
      className={cx("flex shrink-0 items-center justify-center rounded-full bg-accent-soft", className ?? SIZES.md)}
      role="img"
      aria-label={`${name}, ${instrumentLabel(instrument)}`}
    >
      <span aria-hidden>{instrumentIcon(instrument)}</span>
    </span>
  );
}

function PhotoLightbox({
  name,
  instrument,
  photoSrc,
  editStudentId,
  onClose,
}: {
  name: string;
  instrument: string;
  photoSrc: string | null;
  editStudentId?: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const shown = preview ?? photoSrc;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  async function save(fd: FormData) {
    if (!editStudentId) return;
    fd.set("student_id", editStudentId);
    setBusy(true);
    setError(null);
    try {
      const res = await updateStudentPhoto(fd);
      if (!res.ok) throw new Error();
      startTransition(() => router.refresh());
    } catch {
      setError("Couldn't save the photo. Try again.");
      setPreview(null);
    } finally {
      setBusy(false);
    }
  }

  async function onPick(file: File | undefined) {
    if (!file) return;
    try {
      const small = await shrinkPhoto(file);
      setPreview(URL.createObjectURL(small));
      const fd = new FormData();
      fd.set("photo", small);
      await save(fd);
    } catch {
      setError("That file couldn't be read as a photo.");
    }
  }

  async function onRemove() {
    const fd = new FormData();
    fd.set("remove_photo", "1");
    await save(fd);
    setPreview(null);
    onClose();
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${name}'s photo`}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black/80 p-4 backdrop-blur-sm"
      onClick={(e) => {
        e.stopPropagation();
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-[max(1rem,env(safe-area-inset-top))] flex h-11 w-11 items-center justify-center rounded-full bg-white/15 text-2xl text-white hover:bg-white/25"
        aria-label="Close"
      >
        ×
      </button>

      {shown ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={shown}
          alt={name}
          className="max-h-[70vh] max-w-[min(92vw,40rem)] rounded-3xl object-contain shadow-2xl"
        />
      ) : (
        <div className="flex h-56 w-56 items-center justify-center rounded-full bg-accent-soft text-8xl">
          <span aria-hidden>{instrumentIcon(instrument)}</span>
        </div>
      )}
      <div className="text-center text-lg font-semibold text-white">{name}</div>

      {editStudentId && (
        <div className="flex flex-col items-center gap-2">
          <div className="flex flex-wrap justify-center gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => cameraRef.current?.click()}
              className="min-h-11 rounded-full bg-white px-5 text-[15px] font-semibold text-[#2b2521] disabled:opacity-60"
            >
              Take photo
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => libraryRef.current?.click()}
              className="min-h-11 rounded-full bg-white/15 px-5 text-[15px] font-semibold text-white hover:bg-white/25 disabled:opacity-60"
            >
              Choose photo
            </button>
            {shown && (
              <button
                type="button"
                disabled={busy}
                onClick={onRemove}
                className="min-h-11 rounded-full px-4 text-[15px] font-medium text-white/80 underline disabled:opacity-60"
              >
                Remove
              </button>
            )}
          </div>
          {busy && <div className="text-sm text-white/80">Saving…</div>}
          {error && <div className="text-sm text-red-200">{error}</div>}
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              void onPick(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <input
            ref={libraryRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              void onPick(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </div>
      )}
    </div>,
    document.body,
  );
}
