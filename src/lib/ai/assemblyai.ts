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

type Utterance = { speaker: string; start: number; end: number; text: string };
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

// "[12:03] A: Let's try the shift again." One line per speaker turn.
function formatUtterances(utterances: Utterance[] | null | undefined): string {
  if (!utterances?.length) return "";
  return utterances
    .map((u) => {
      const s = Math.floor(u.start / 1000);
      const stamp = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
      return `[${stamp}] ${u.speaker}: ${u.text}`;
    })
    .join("\n");
}
