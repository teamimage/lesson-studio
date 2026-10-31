// Reads when a video started recording from its file metadata, in the browser.
// iPhone .mov/.mp4 files carry "com.apple.quicktime.creationdate" (local time
// with offset, the moment recording began) and the movie header's creation
// time (UTC seconds). Reads only the small "moov" box, never the whole video.

const MAX_MOOV_BYTES = 64 * 1024 * 1024;
const MAC_EPOCH_OFFSET_S = 2082844800; // 1904-01-01 to 1970-01-01

async function bytes(file: Blob, start: number, end: number): Promise<Uint8Array> {
  return new Uint8Array(await file.slice(start, end).arrayBuffer());
}

function boxType(b: Uint8Array, at: number): string {
  return String.fromCharCode(b[at], b[at + 1], b[at + 2], b[at + 3]);
}

async function findMoov(file: Blob): Promise<Uint8Array | null> {
  let pos = 0;
  for (let i = 0; i < 64 && pos + 8 <= file.size; i++) {
    const head = await bytes(file, pos, pos + 16);
    const view = new DataView(head.buffer, head.byteOffset, head.byteLength);
    let size = view.getUint32(0);
    const type = boxType(head, 4);
    let header = 8;
    if (size === 1 && head.length >= 16) {
      size = Number(view.getBigUint64(8));
      header = 16;
    } else if (size === 0) {
      size = file.size - pos;
    }
    if (size < header) return null;
    if (type === "moov") {
      if (size > MAX_MOOV_BYTES) return null;
      return bytes(file, pos, pos + size);
    }
    pos += size;
  }
  return null;
}

function plausible(ms: number): boolean {
  return Number.isFinite(ms) && ms > Date.UTC(2015, 0, 1) && ms < Date.now() + 86_400_000;
}

export async function readVideoStartTime(file: Blob): Promise<Date | null> {
  try {
    const moov = await findMoov(file);
    if (!moov) return null;

    // 1) Apple's creation date string, e.g. 2026-10-31T10:02:05-0700
    // One character per byte, so string indexes match byte offsets.
    const text = new TextDecoder("latin1").decode(moov);
    if (text.includes("com.apple.quicktime.creationdate")) {
      const m = text.match(/(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})([+-]\d{2}):?(\d{2})|(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})Z/);
      if (m) {
        const iso = m[1] ? `${m[1]}${m[2]}:${m[3]}` : `${m[4]}Z`;
        const ms = Date.parse(iso);
        if (plausible(ms)) return new Date(ms);
      }
    }

    // 2) Movie header creation time (seconds since 1904, UTC).
    const at = text.indexOf("mvhd");
    if (at >= 0) {
      const view = new DataView(moov.buffer, moov.byteOffset, moov.byteLength);
      const version = moov[at + 4];
      const secs = version === 1 ? Number(view.getBigUint64(at + 8)) : view.getUint32(at + 8);
      const ms = (secs - MAC_EPOCH_OFFSET_S) * 1000;
      if (plausible(ms)) return new Date(ms);
    }
  } catch {
    // Unreadable metadata just means the teacher lines it up by hand.
  }
  return null;
}
