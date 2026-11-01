// Prices used to work out the dollar cost of each AI call, which is saved
// with the call in ai_usage. Check these against the providers' price pages
// now and then; old rows keep the cost they were logged with.
//   Claude: https://platform.claude.com/docs/en/about-claude/pricing
//   AssemblyAI: https://www.assemblyai.com/pricing

/** US dollars per million tokens. */
type ClaudeRates = { input: number; output: number; cacheRead: number; cacheWrite: number };

const CLAUDE_RATES: Record<string, ClaudeRates> = {
  "claude-fable-5-1": { input: 10, output: 50, cacheRead: 0.25, cacheWrite: 12.5 },
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  "claude-opus-5": { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  "claude-opus-4-8": { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
};
// Unknown model ids are priced like the most expensive one, so a total is never too low.
const FALLBACK_RATES = CLAUDE_RATES["claude-fable-5-1"];

export type ClaudeUsage = {
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
};

export function claudeCost(u: ClaudeUsage): number {
  const r = CLAUDE_RATES[u.model] ?? FALLBACK_RATES;
  return (
    (u.input_tokens * r.input +
      u.output_tokens * r.output +
      u.cache_read_tokens * r.cacheRead +
      u.cache_write_tokens * r.cacheWrite) /
    1_000_000
  );
}

/** AssemblyAI pre-recorded speech-to-text, US dollars per hour of audio. */
export const TRANSCRIPTION_MODEL = "universal-3-5-pro";
const TRANSCRIPTION_PER_HOUR = 0.21;
const SPEAKER_LABELS_PER_HOUR = 0.02;

export function transcriptionCost(audioSeconds: number): number {
  return (audioSeconds / 3600) * (TRANSCRIPTION_PER_HOUR + SPEAKER_LABELS_PER_HOUR);
}

export function formatUsd(n: number): string {
  if (n > 0 && n < 0.01) return "<$0.01";
  return `$${n.toFixed(2)}`;
}
