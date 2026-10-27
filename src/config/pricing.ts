// Prices for the Under the hood cost meter (brief §9). Each carries its source and access date.
// Once approved these are fixed: changes go through CHANGES.md (brief §0 rule 4).

export interface Price {
  usd: number;
  unit: string;
  source: string;
}

export const PRICES = {
  stt: {
    usd: 0.0043,
    unit: "per audio minute, billed per second (Deepgram Nova-3, pre-recorded)",
    source:
      "Research §9 ($0.0043/min for pre-recorded audio), matching deepgram.com/pricing accessed 26 Oct 2026. Opting out of the Model Improvement Program has no impact on listed Pay-as-you-Go or Growth rates (Deepgram changelog, 5 Mar 2026); Enterprise terms may differ.",
  },
  tts: {
    usd: 0.03,
    unit: "per 1,000 characters (Deepgram Aura-2)",
    source: "Research §9 (about $30 per 1M characters, secondary), confirmed on deepgram.com/pricing accessed 26 Oct 2026.",
  },
  llmInput: {
    usd: 0.1,
    unit: "per 1M uncached input tokens (OpenAI gpt-6-luna)",
    source: "OpenAI model page for gpt-6-luna, accessed 26 Oct 2026. Not in the research, which priced Gemini 3.8 Flash (PLAN I22, D16).",
  },
  llmCachedInput: { usd: 0.01, unit: "per 1M cached input tokens (gpt-6-luna)", source: "As above." },
  llmCacheWrite: { usd: 0.125, unit: "per 1M input tokens written to the cache (gpt-6-luna)", source: "As above." },
  llmOutput: { usd: 0.5, unit: "per 1M output tokens, including reasoning (gpt-6-luna)", source: "As above." },
} satisfies Record<string, Price>;

export interface Meter {
  sttSeconds: number;
  ttsChars: number;
  inputTokens: number; // all input tokens, as reported
  cachedTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
}

export const EMPTY_METER: Meter = { sttSeconds: 0, ttsChars: 0, inputTokens: 0, cachedTokens: 0, cacheWriteTokens: 0, outputTokens: 0 };

/** Session cost in USD from measured usage. Cached and cache-write tokens are priced separately from plain input. */
export function sessionCost(m: Meter): { stt: number; llm: number; tts: number; total: number } {
  const plainInput = Math.max(0, m.inputTokens - m.cachedTokens - m.cacheWriteTokens);
  const stt = (m.sttSeconds / 60) * PRICES.stt.usd;
  const tts = (m.ttsChars / 1000) * PRICES.tts.usd;
  const llm =
    (plainInput * PRICES.llmInput.usd +
      m.cachedTokens * PRICES.llmCachedInput.usd +
      m.cacheWriteTokens * PRICES.llmCacheWrite.usd +
      m.outputTokens * PRICES.llmOutput.usd) /
    1_000_000;
  return { stt, llm, tts, total: stt + llm + tts };
}
