import type { Env } from "../env";
import { ProviderError } from "./error";

/** Brief §7 TTS: Aura-2, MP3, voice from env, MIP opt-out. Speed stays client-side (playbackRate). */
export function ttsUrl(env: Pick<Env, "TTS_VOICE">): string {
  const q = new URLSearchParams({ model: env.TTS_VOICE, encoding: "mp3", bit_rate: "48000", mip_opt_out: "true" });
  return `https://api.deepgram.com/v1/speak?${q}`;
}

/** Returns the MP3 stream as Deepgram sends it, so playback can start before the file is complete. */
export async function synthesize(text: string, env: Env): Promise<ReadableStream<Uint8Array>> {
  const res = await fetch(ttsUrl(env), {
    method: "POST",
    headers: { Authorization: `Token ${env.DEEPGRAM_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok || !res.body) throw new ProviderError(`deepgram_${res.status}`);
  return res.body;
}
