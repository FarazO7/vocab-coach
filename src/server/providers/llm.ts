import OpenAI, { APIConnectionError, APIConnectionTimeoutError, APIError, APIUserAbortError } from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { ZodError } from "zod";
import { DEFAULTS } from "../../config/defaults";
import type { Env } from "../env";
import { LlmTurnSchema } from "../schemas";

export interface Usage {
  input_tokens: number;
  cached_tokens: number;
  cache_write_tokens: number;
  output_tokens: number;
  reasoning_tokens: number;
}

export const ZERO_USAGE: Usage = { input_tokens: 0, cached_tokens: 0, cache_write_tokens: 0, output_tokens: 0, reasoning_tokens: 0 };

export const addUsage = (a: Usage, b: Usage): Usage => ({
  input_tokens: a.input_tokens + b.input_tokens,
  cached_tokens: a.cached_tokens + b.cached_tokens,
  cache_write_tokens: a.cache_write_tokens + b.cache_write_tokens,
  output_tokens: a.output_tokens + b.output_tokens,
  reasoning_tokens: a.reasoning_tokens + b.reasoning_tokens,
});

export type LlmOutcome = { ok: true; value: unknown; usage: Usage } | { ok: false; code: string; usage: Usage };
export type LlmCall = (args: { instructions: string; input: string }) => Promise<LlmOutcome>;

export const TURN_FORMAT = zodTextFormat(LlmTurnSchema, "turn_result");

function toUsage(u: OpenAI.Responses.ResponseUsage | undefined | null): Usage {
  if (!u) return ZERO_USAGE;
  return {
    input_tokens: u.input_tokens,
    cached_tokens: u.input_tokens_details?.cached_tokens ?? 0,
    cache_write_tokens: u.input_tokens_details?.cache_write_tokens ?? 0,
    output_tokens: u.output_tokens,
    reasoning_tokens: u.output_tokens_details?.reasoning_tokens ?? 0,
  };
}

function failureCode(e: unknown): string {
  if (e instanceof APIConnectionTimeoutError || e instanceof APIUserAbortError) return "timeout";
  if (e instanceof APIConnectionError) return "network";
  if (e instanceof APIError) return `http_${e.status ?? "unknown"}`;
  if (e instanceof ZodError || e instanceof SyntaxError) return "schema"; // responses.parse rejected the JSON
  throw e;
}

/**
 * One OpenAI call per invocation. The SDK's own retries are off (D6 counts every call), the timeout is 6 s,
 * reasoning effort comes from env (D13), and store: false keeps no 30-day application state.
 */
export function openAiLlm(env: Env): LlmCall {
  const client = new OpenAI({
    apiKey: env.OPENAI_API_KEY,
    maxRetries: 0,
    timeout: DEFAULTS.llmTimeoutMs,
    fetch: (url, init) => globalThis.fetch(url, init),
  });
  return async ({ instructions, input }) => {
    try {
      const res = await client.responses.parse({
        model: env.LLM_MODEL,
        instructions,
        input,
        text: { format: TURN_FORMAT },
        reasoning: { effort: env.LLM_REASONING_EFFORT },
        store: false,
        max_output_tokens: 800,
      });
      const usage = toUsage(res.usage);
      if (res.status === "incomplete") return { ok: false, code: "incomplete", usage };
      const refused = res.output.some((o) => o.type === "message" && o.content.some((c) => c.type === "refusal"));
      if (refused) return { ok: false, code: "refusal", usage };
      if (res.output_parsed == null) return { ok: false, code: "schema", usage };
      return { ok: true, value: res.output_parsed, usage };
    } catch (e) {
      return { ok: false, code: failureCode(e), usage: ZERO_USAGE };
    }
  };
}
