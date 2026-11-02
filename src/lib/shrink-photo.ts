// Runs in the browser. Turns a camera photo (often 3-12 MB, sometimes HEIC
// that Safari has already converted) into a small JPEG, at most 1200 px on
// the long side, keeping the phone's rotation. Big enough to view enlarged,
// small enough to upload in a moment.

const LONG_SIDE = 1200;
const TARGET_BYTES = 900 * 1024;

async function decode(file: File): Promise<{ img: CanvasImageSource; w: number; h: number; done: () => void }> {
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { img: bmp, w: bmp.width, h: bmp.height, done: () => bmp.close() };
    } catch {
      // Fall through to <img>, which some older Safari versions need.
    }
  }
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.decoding = "async";
  img.src = url;
  await img.decode();
  return { img, w: img.naturalWidth, h: img.naturalHeight, done: () => URL.revokeObjectURL(url) };
}

export async function shrinkPhoto(file: File): Promise<File> {
  const { img, w, h, done } = await decode(file);
  try {
    const scale = Math.min(1, LONG_SIDE / Math.max(w, h));
    const cw = Math.max(1, Math.round(w * scale));
    const ch = Math.max(1, Math.round(h * scale));
    const canvas = document.createElement("canvas");
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no canvas");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, cw, ch);
    ctx.drawImage(img, 0, 0, cw, ch);

    let blob: Blob | null = null;
    for (const quality of [0.85, 0.75, 0.6]) {
      blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
      if (blob && blob.size <= TARGET_BYTES) break;
    }
    if (!blob) throw new Error("could not encode");
    return new File([blob], "photo.jpg", { type: "image/jpeg" });
  } finally {
    done();
  }
}
