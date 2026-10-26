import { z } from "zod";
import type { Env } from "../env";
import { ProviderError } from "./error";

// Deepgram pre-recorded response, only the fields we use.
const ListenSchema = z.object({
  metadata: z.object({ duration: z.number() }),
  results: z.object({
    channels: z.array(
      z.object({
        alternatives: z.array(
          z.object({
            transcript: z.string(),
            words: z.array(z.object({ word: z.string(), confidence: z.number(), start: z.number(), end: z.number() })),
          }),
        ),
      }),
    ),
  }),
});

export interface SttResult {
  transcript: string;
  words: { w: string; conf: number; start: number; end: number }[];
  durationS: number;
}

/** Brief §7 STT: Nova-3 with en-IN, punctuation and smart formatting, no keyterm boosting, MIP opt-out. */
export function sttUrl(env: Pick<Env, "STT_MODEL" | "STT_LANGUAGE">): string {
  const q = new URLSearchParams({
    model: env.STT_MODEL,
    language: env.STT_LANGUAGE,
    punctuate: "true",
    smart_format: "true",
    mip_opt_out: "true",
  });
  return `https://api.deepgram.com/v1/listen?${q}`;
}

export async function transcribe(audio: ArrayBuffer, contentType: string, env: Env): Promise<SttResult> {
  const res = await fetch(sttUrl(env), {
    method: "POST",
    headers: { Authorization: `Token ${env.DEEPGRAM_API_KEY}`, "Content-Type": contentType },
    body: audio,
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new ProviderError(`deepgram_${res.status}`);
  const parsed = ListenSchema.safeParse(await res.json());
  if (!parsed.success) throw new ProviderError("deepgram_shape");
  const alt = parsed.data.results.channels[0]?.alternatives[0];
  return {
    transcript: alt?.transcript ?? "",
    words: (alt?.words ?? []).map((w) => ({ w: w.word, conf: w.confidence, start: w.start, end: w.end })),
    durationS: parsed.data.metadata.duration,
  };
}
