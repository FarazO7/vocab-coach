import { z } from "zod";

export const VOICES = ["aura-2-draco-en", "aura-2-pandora-en", "aura-2-harmonia-en"] as const;

/** Empty values (as copied from .env.example) fall back to the default. */
const opt = (fallback: string) =>
  z
    .string()
    .optional()
    .transform((v) => (v && v.trim() ? v.trim() : fallback));

const EnvSchema = z.object({
  DEEPGRAM_API_KEY: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1),
  SESSION_SECRET: z.string().min(32),
  LLM_MODEL: opt("gpt-6-luna"),
  LLM_REASONING_EFFORT: opt("none").pipe(z.enum(["none", "low", "medium", "high"])),
  STT_MODEL: opt("nova-3"),
  STT_LANGUAGE: opt("en-IN"),
  // Provisional until you pick a voice from the rendered samples (PLAN §8); change it in env, not code.
  TTS_VOICE: opt("aura-2-harmonia-en").pipe(z.enum(VOICES)),
  VOICE_ENABLED: opt("true")
    .pipe(z.enum(["true", "false"]))
    .transform((v) => v === "true"),
});

export type Env = z.infer<typeof EnvSchema>;

export class EnvError extends Error {}

/** Server-only. Errors name the variables, never their values. */
export function getEnv(source: Record<string, string | undefined> = process.env): Env {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    throw new EnvError(`Invalid server env: ${parsed.error.issues.map((i) => i.path.join(".")).join(", ")}`);
  }
  return parsed.data;
}
