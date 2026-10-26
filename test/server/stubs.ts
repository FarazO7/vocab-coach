import { vi } from "vitest";
import { issueToken } from "../../src/server/token";

export const ORIGIN = "http://localhost:3000";

export const ENV: Record<string, string> = {
  DEEPGRAM_API_KEY: "dg_test_key_0123456789",
  OPENAI_API_KEY: "sk-test-0123456789abcdef",
  SESSION_SECRET: "test-secret-that-is-at-least-32-characters-long",
  LLM_MODEL: "",
  LLM_REASONING_EFFORT: "",
  STT_MODEL: "",
  STT_LANGUAGE: "",
  TTS_VOICE: "",
  VOICE_ENABLED: "",
};

export function stubEnv(overrides: Record<string, string> = {}): void {
  for (const [k, v] of Object.entries({ ...ENV, ...overrides })) vi.stubEnv(k, v);
}

export const token = (now = Date.now()) => issueToken(ENV.SESSION_SECRET!, now).token;

export function request(path: string, init: { body?: BodyInit; headers?: Record<string, string>; origin?: string | null; auth?: string | null } = {}): Request {
  const headers: Record<string, string> = { "content-type": "application/json", ...init.headers };
  if (init.origin !== null) headers.origin = init.origin ?? ORIGIN;
  const auth = init.auth === undefined ? token() : init.auth;
  if (auth) headers.authorization = `Bearer ${auth}`;
  return new Request(`${ORIGIN}${path}`, { method: "POST", headers, body: init.body ?? "{}" });
}

export const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** A minimal OpenAI Responses API body carrying `content` as the model's JSON output. */
export function openAiBody(content: unknown, extra: Record<string, unknown> = {}) {
  return {
    id: "resp_test",
    object: "response",
    created_at: 0,
    status: "completed",
    model: "gpt-6-luna",
    output: [
      {
        type: "message",
        id: "msg_test",
        role: "assistant",
        status: "completed",
        content: [{ type: "output_text", text: typeof content === "string" ? content : JSON.stringify(content), annotations: [] }],
      },
    ],
    usage: {
      input_tokens: 900,
      input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
      output_tokens: 60,
      output_tokens_details: { reasoning_tokens: 0 },
      total_tokens: 960,
    },
    ...extra,
  };
}

export const goodTurn = (p: Record<string, unknown> = {}) => ({
  reply: "Nice. What else happened today?",
  judgement: null,
  spontaneous: [],
  deferred_note: null,
  learner_state: "ok",
  ...p,
});

export function deepgramListen(transcript: string, words: [string, number][], duration = 3.2) {
  return {
    metadata: { duration },
    results: {
      channels: [
        {
          alternatives: [
            {
              transcript,
              words: words.map(([word, confidence], i) => ({ word, confidence, start: i * 0.4, end: i * 0.4 + 0.35 })),
            },
          ],
        },
      ],
    },
  };
}

type Handler = (url: string, init: RequestInit) => Response | Promise<Response>;

/** Routes fetch by host so Deepgram and OpenAI can be stubbed independently. Records every call. */
export function stubFetch(handlers: { openai?: Handler; listen?: Handler; speak?: Handler }) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fn = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    calls.push({ url, init });
    if (url.includes("api.openai.com") && handlers.openai) return handlers.openai(url, init);
    if (url.includes("api.deepgram.com/v1/listen") && handlers.listen) return handlers.listen(url, init);
    if (url.includes("api.deepgram.com/v1/speak") && handlers.speak) return handlers.speak(url, init);
    throw new Error(`unexpected fetch: ${url}`);
  });
  vi.stubGlobal("fetch", fn);
  return calls;
}
