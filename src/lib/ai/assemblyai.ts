import "server-only";
import { TRANSCRIPTION_MODEL } from "./pricing";

// AssemblyAI fetches the video itself from a signed link (files up to 5 GB /
// 10 hours), pulls out the audio and transcribes the speech with speaker
// labels. Nothing large passes through our servers.
// API: https://www.assemblyai.com/docs/pre-recorded-audio/api-reference/transcripts/submit

const API = "https://api.assemblyai.com/v2/transcript";

export class MissingKeyError extends Error {}

function key(): string {
  const k = process.env.ASSEMBLYAI_API_KEY;
  if (!k) throw new MissingKeyError("ASSEMBLYAI_API_KEY isn't set in Vercel yet.");
  return k;
}

export async function submitTranscription(audioUrl: string, keyterms: string[]): Promise<string> {
  const res = await fetch(API, {
    method: "POST",
    headers: { authorization: key(), "content-type": "application/json" },
    body: JSON.stringify({
      audio_url: audioUrl,
      speech_models: [TRANSCRIPTION_MODEL],
      speaker_labels: true,
      language_code: "en",
      // Piece titles and string terms help it spell what the teacher says.
      ...(keyterms.length ? { keyterms_prompt: keyterms.slice(0, 200) } : {}),
    }),
    cache: "no-store",
  });
  const body = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
  if (!res.ok || !body.id) throw new Error(body.error || `Transcription service said ${res.status}.`);
  return body.id;
}

type Word = { text: string; start: number; end: number };
type Utterance = { speaker: string; start: number; end: number; text: string; words?: Word[] | null };
export type TranscriptResult =
  | { status: "pending" }
  | { status: "error"; error: string }
  | { status: "completed"; audioSeconds: number; text: string };

export async function getTranscription(id: string): Promise<TranscriptResult> {
  const res = await fetch(`${API}/${encodeURIComponent(id)}`, {
    headers: { authorization: key() },
    cache: "no-store",
  });
  const body = (await res.json().catch(() => ({}))) as {
    status?: string;
    error?: string;
    audio_duration?: number | null;
    text?: string | null;
    utterances?: Utterance[] | null;
  };
  if (!res.ok) return { status: "error", error: body.error || `Transcription service said ${res.status}.` };
  if (body.status === "error") return { status: "error", error: body.error || "Transcription failed." };
  if (body.status !== "completed") return { status: "pending" };
  return {
    status: "completed",
    audioSeconds: Number(body.audio_duration) || 0,
    text: formatUtterances(body.utterances) || body.text || "",
  };
}

// A teacher talking through a passage is one long speaker turn (often
// several minutes), so one time stamp per turn is far too coarse to place
// the lesson's moments. Each turn is cut into lines with their own stamps:
// at a sentence end once a few seconds have passed, and at any word once a
// line runs long. A long gap between words (the student playing, nobody
// talking) gets its own line, so Claude can see where the playing was.
const SENTENCE_LINE_MS = 6_000;
const MAX_LINE_MS = 15_000;
const GAP_MS = 6_000;

function stamp(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// "[12:03] B: Let's try the shift again." Several lines per speaker turn.
export function formatUtterances(utterances: Utterance[] | null | undefined): string {
  if (!utterances?.length) return "";
  const lines: string[] = [];
  let lastEnd: number | null = null;
  const gap = (from: number, to: number) => {
    if (to - from >= GAP_MS) lines.push(`[${stamp(from)}–${stamp(to)}] (no talking: probably playing)`);
  };
  for (const u of utterances) {
    const words = (u.words ?? []).filter((w) => w.text);
    if (!words.length) {
      if (lastEnd !== null) gap(lastEnd, u.start);
      lines.push(`[${stamp(u.start)}] ${u.speaker}: ${u.text}`);
      lastEnd = u.end;
      continue;
    }
    let line: Word[] = [];
    const flush = () => {
      if (line.length) lines.push(`[${stamp(line[0].start)}] ${u.speaker}: ${line.map((w) => w.text).join(" ")}`);
      line = [];
    };
    for (const w of words) {
      if (lastEnd !== null && w.start - lastEnd >= GAP_MS) {
        flush();
        gap(lastEnd, w.start);
      }
      line.push(w);
      lastEnd = w.end;
      const span = w.end - line[0].start;
      if ((/[.?!]$/.test(w.text) && span >= SENTENCE_LINE_MS) || span >= MAX_LINE_MS) flush();
    }
    flush();
  }
  return lines.join("\n");
}

// A short spoken instruction from the teacher (a minute or two at most):
// the audio is sent to AssemblyAI's upload endpoint, transcribed without
// speaker labels, and polled until the text is ready.
// https://www.assemblyai.com/docs/api-reference/files/upload
export async function transcribeClip(
  audio: ArrayBuffer,
  keyterms: string[],
  timeoutMs = 45_000,
): Promise<{ text: string; audioSeconds: number }> {
  const up = await fetch("https://api.assemblyai.com/v2/upload", {
    method: "POST",
    headers: { authorization: key(), "content-type": "application/octet-stream" },
    body: audio,
    cache: "no-store",
  });
  const upBody = (await up.json().catch(() => ({}))) as { upload_url?: string; error?: string };
  if (!up.ok || !upBody.upload_url) throw new Error(upBody.error || `Transcription upload said ${up.status}.`);

  const res = await fetch(API, {
    method: "POST",
    headers: { authorization: key(), "content-type": "application/json" },
    body: JSON.stringify({
      audio_url: upBody.upload_url,
      speech_models: [TRANSCRIPTION_MODEL],
      language_code: "en",
      ...(keyterms.length ? { keyterms_prompt: keyterms.slice(0, 200) } : {}),
    }),
    cache: "no-store",
  });
  const body = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
  if (!res.ok || !body.id) throw new Error(body.error || `Transcription service said ${res.status}.`);

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 800));
    const poll = await fetch(`${API}/${encodeURIComponent(body.id)}`, {
      headers: { authorization: key() },
      cache: "no-store",
    });
    const p = (await poll.json().catch(() => ({}))) as {
      status?: string;
      error?: string;
      text?: string | null;
      audio_duration?: number | null;
    };
    if (p.status === "error") throw new Error(p.error || "Transcription failed.");
    if (p.status === "completed") return { text: (p.text ?? "").trim(), audioSeconds: Number(p.audio_duration) || 0 };
  }
  throw new Error("Transcription took too long. Try again, or type the change.");
}
