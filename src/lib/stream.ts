import "server-only";

/**
 * Cloudflare Stream: makes a compressed, adaptive (HLS) copy of each lesson
 * video so it starts playing in a second or two instead of pulling a 3 GB
 * original. The original stays in Supabase Storage as the master.
 *
 * Turned on by two server-only env vars (Vercel, lesson-studio project):
 *   CLOUDFLARE_ACCOUNT_ID    the account id shown on the Cloudflare dashboard
 *   CLOUDFLARE_STREAM_TOKEN  an API token with the "Stream: Edit" permission
 * Without them everything plays the original, as before.
 *
 * Videos are uploaded with requireSignedURLs, so a viewer needs a short-lived
 * token from our server (made only for people who can already see the
 * recording row) to play them.
 */

const API = "https://api.cloudflare.com/client/v4";
/** How long a playback token lasts. Long enough to watch a whole lesson. */
const TOKEN_SECONDS = 6 * 60 * 60;

export function streamingEnabled(): boolean {
  return Boolean(process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_STREAM_TOKEN);
}

type CfVideo = {
  uid: string;
  readyToStream?: boolean;
  status?: { state?: string; errorReasonCode?: string; errorReasonText?: string; pctComplete?: string };
  playback?: { hls?: string };
};

type CfResponse<T> = { success: boolean; result: T; errors?: { message?: string }[] };

async function cf<T>(path: string, init: RequestInit = {}): Promise<T> {
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  const token = process.env.CLOUDFLARE_STREAM_TOKEN;
  if (!account || !token) throw new Error("Cloudflare Stream isn't set up.");
  const res = await fetch(`${API}/accounts/${account}/stream${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init.headers },
    cache: "no-store",
  });
  const json = (await res.json().catch(() => null)) as CfResponse<T> | null;
  if (!res.ok || !json?.success) {
    const msg = json?.errors?.map((e) => e.message).filter(Boolean).join("; ");
    throw new Error(msg || `Cloudflare Stream answered ${res.status}.`);
  }
  return json.result;
}

export type StreamState = {
  status: "pending" | "ready" | "error";
  hlsUrl: string | null;
  error: string | null;
  /** Cloudflare's own progress while encoding, 0 to 100, when it says. */
  percent: number | null;
};

function toState(v: CfVideo): StreamState {
  const state = v.status?.state;
  if (state === "error") {
    return {
      status: "error",
      hlsUrl: null,
      error: v.status?.errorReasonText || v.status?.errorReasonCode || "Cloudflare couldn't prepare this video.",
      percent: null,
    };
  }
  const pct = Number(v.status?.pctComplete);
  return {
    status: v.readyToStream ? "ready" : "pending",
    hlsUrl: v.playback?.hls ?? null,
    error: null,
    percent: Number.isFinite(pct) ? Math.round(pct) : null,
  };
}

/** Asks Cloudflare to fetch the original from a signed link and encode it. */
export async function startStreamCopy(input: {
  sourceUrl: string;
  name: string;
  recordingId: string;
}): Promise<{ uid: string } & StreamState> {
  const v = await cf<CfVideo>("/copy", {
    method: "POST",
    body: JSON.stringify({
      url: input.sourceUrl,
      requireSignedURLs: true,
      meta: { name: input.name, recordingId: input.recordingId },
    }),
  });
  return { uid: v.uid, ...toState(v) };
}

export async function getStreamState(uid: string): Promise<StreamState> {
  return toState(await cf<CfVideo>(`/${uid}`));
}

export async function deleteStream(uid: string): Promise<void> {
  await cf<unknown>(`/${uid}`, { method: "DELETE" }).catch(() => {});
}

/**
 * A signed HLS address for one viewer. The manifest address Cloudflare gave
 * us has the video id in it; a signed token goes in its place.
 */
export async function signedHlsUrl(uid: string, hlsUrl: string | null): Promise<string> {
  const { token } = await cf<{ token: string }>(`/${uid}/token`, {
    method: "POST",
    body: JSON.stringify({ exp: Math.floor(Date.now() / 1000) + TOKEN_SECONDS }),
  });
  const base = hlsUrl ?? `https://videodelivery.net/${uid}/manifest/video.m3u8`;
  return base.replace(uid, token);
}
