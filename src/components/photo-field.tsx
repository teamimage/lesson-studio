"use client";

import { useEffect, useRef, useState } from "react";
import { shrinkPhoto } from "@/lib/shrink-photo";
import { AvatarFace } from "./avatar";

/**
 * Photo picker for the Add student and Edit student forms. The chosen
 * photo is shrunk on the device, then put into a hidden file input named
 * "photo" so it goes up with the rest of the form.
 */
export function PhotoField({
  name,
  instrument,
  photoSrc,
}: {
  name?: string;
  instrument?: string;
  photoSrc?: string | null;
}) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const sendRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [removed, setRemoved] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const shown = preview ?? (removed ? null : photoSrc ?? null);

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  async function onPick(file: File | undefined) {
    if (!file || !sendRef.current) return;
    setWorking(true);
    setError(null);
    try {
      const small = await shrinkPhoto(file);
      const dt = new DataTransfer();
      dt.items.add(small);
      sendRef.current.files = dt.files;
      setPreview(URL.createObjectURL(small));
      setRemoved(false);
    } catch {
      setError("That file couldn't be read as a photo.");
    } finally {
      setWorking(false);
    }
  }

  function onRemove() {
    if (sendRef.current) sendRef.current.value = "";
    setPreview(null);
    setRemoved(true);
  }

  return (
    <div className="flex items-center gap-4">
      <AvatarFace
        name={name || "Student"}
        instrument={instrument ?? ""}
        photoSrc={shown}
        className="h-20 w-20 text-4xl"
      />
      <div className="flex min-w-0 flex-col gap-1.5">
        <span className="text-sm font-semibold">Photo</span>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => cameraRef.current?.click()}
            className="min-h-9 rounded-full border border-rule bg-sheet px-3 text-sm font-medium hover:border-accent/50"
          >
            Take photo
          </button>
          <button
            type="button"
            onClick={() => libraryRef.current?.click()}
            className="min-h-9 rounded-full border border-rule bg-sheet px-3 text-sm font-medium hover:border-accent/50"
          >
            Choose photo
          </button>
          {shown && (
            <button type="button" onClick={onRemove} className="min-h-9 px-2 text-sm text-muted underline">
              Remove
            </button>
          )}
        </div>
        {working && <span className="text-xs text-muted">Preparing photo…</span>}
        {error && <span className="text-xs text-danger">{error}</span>}
      </div>
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
      <input ref={sendRef} type="file" name="photo" accept="image/jpeg" className="hidden" tabIndex={-1} aria-hidden />
      {removed && !preview && <input type="hidden" name="remove_photo" value="1" />}
    </div>
  );
}
