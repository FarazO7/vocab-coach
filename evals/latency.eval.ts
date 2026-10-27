import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import OpenAI from "openai";
import { expect, it } from "vitest";
import { getEnv } from "../src/server/env";
import { buildInput, SYSTEM_PROMPT } from "../src/server/prompt";
import { TURN_FORMAT } from "../src/server/providers/llm";
import { TurnRequestSchema, type TurnRequest } from "../src/server/schemas";

// M5 latency pass (brief §7 targets: tap-release to first agent audio, p50 <= 2.5 s, p95 <= 4 s).
// A: the real pipeline through a running server (stt -> turn -> tts first byte), as the browser makes it.
// B: the LLM alone, plain vs streamed, to size what streaming the reply would save.
// Run: npm run eval:latency (needs .env.local and `next start -p 3100`, or LATENCY_BASE).
process.loadEnvFile?.(".env.local");

const BASE = process.env.LATENCY_BASE ?? "http://localhost:3100";
const TURNS = Number(process.env.LATENCY_TURNS ?? 20);
const LLM_RUNS = Number(process.env.LATENCY_LLM_RUNS ?? 10);
const audio = readFileSync("scripts/fixtures/commute.m4a");

const profile = { name: "Asha", exam: "IELTS", level: "B1", interests: ["city_transport"] } as const;
const DIRECTIVES: TurnRequest["directive"][] = [
  { type: "CONVERSE", item_id: null, hint_level: 0, repair_allowed: false },
  { type: "ELICIT", item_id: "bottleneck_n", hint_level: 0, repair_allowed: false },
  { type: "HINT", item_id: "bottleneck_n", hint_level: 1, repair_allowed: false },
  { type: "JUDGE", item_id: "gruelling_adj", hint_level: 0, repair_allowed: true },
  { type: "SEED", item_id: "congested_adj", hint_level: 0, repair_allowed: false },
];

const pct = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] ?? 0;
};
const stats = (xs: number[]) => ({ p50: Math.round(pct(xs, 50)), p95: Math.round(pct(xs, 95)), min: Math.round(Math.min(...xs)), max: Math.round(Math.max(...xs)) });

async function timed<T>(fn: () => Promise<T>): Promise<[T, number]> {
  const t0 = performance.now();
  const out = await fn();
  return [out, performance.now() - t0];
}

async function pipeline() {
  const headers = { Origin: BASE, "Content-Type": "application/json" };
  const session = (await (await fetch(`${BASE}/api/session`, { method: "POST", headers, body: "{}" })).json()) as { token: string };
  const auth = { ...headers, Authorization: `Bearer ${session.token}` };
  const rows: { directive: string; sttMs: number; turnMs: number; llmMs: number; ttsFirstMs: number; totalMs: number; calls: number }[] = [];
  for (let i = 0; i < TURNS; i++) {
    const [stt, sttMs] = await timed(async () => (await (await fetch(`${BASE}/api/stt`, { method: "POST", headers: { ...auth, "Content-Type": "audio/mp4" }, body: audio })).json()) as { transcript: string });
    const directive = DIRECTIVES[i % DIRECTIVES.length]!;
    const body: TurnRequest = TurnRequestSchema.parse({ directive, candidateIds: [], history: [{ speaker: "agent", text: "How was your commute today?" }], utterance: stt.transcript, profile, topic: "city_transport" });
    const [turn, turnMs] = await timed(async () => (await (await fetch(`${BASE}/api/turn`, { method: "POST", headers: auth, body: JSON.stringify(body) })).json()) as { result: { reply: string }; llmMs: number; calls: number });
    const t0 = performance.now();
    const res = await fetch(`${BASE}/api/tts`, { method: "POST", headers: auth, body: JSON.stringify({ text: turn.result.reply }) });
    const reader = res.body!.getReader();
    await reader.read();
    const ttsFirstMs = performance.now() - t0;
    await reader.cancel();
    rows.push({ directive: directive.type, sttMs, turnMs, llmMs: turn.llmMs, ttsFirstMs, totalMs: sttMs + turnMs + ttsFirstMs, calls: turn.calls });
  }
  return {
    turns: rows.length,
    sttMs: stats(rows.map((r) => r.sttMs)),
    turnMs: stats(rows.map((r) => r.turnMs)),
    llmMs: stats(rows.map((r) => r.llmMs)),
    ttsFirstMs: stats(rows.map((r) => r.ttsFirstMs)),
    totalMs: stats(rows.map((r) => r.totalMs)),
    rows,
  };
}

/** Time until the "reply" string is complete in the streamed JSON (it's the first field in the schema). */
const REPLY_DONE = /"reply"\s*:\s*"((?:[^"\\]|\\.)*)"/;

async function llmPlainVsStreamed() {
  const env = getEnv();
  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY, maxRetries: 0, timeout: 15_000 });
  const req = TurnRequestSchema.parse({ directive: DIRECTIVES[1], candidateIds: [], history: [{ speaker: "agent", text: "How was your commute today?" }], utterance: "The traffic near the flyover is terrible every evening.", profile, topic: "city_transport" });
  const base = {
    model: env.LLM_MODEL,
    instructions: SYSTEM_PROMPT,
    input: buildInput(req, "latency"),
    text: { format: { type: "json_schema" as const, name: TURN_FORMAT.name, schema: TURN_FORMAT.schema as Record<string, unknown>, strict: true } },
    reasoning: { effort: env.LLM_REASONING_EFFORT },
    store: false,
    max_output_tokens: 800,
  };
  const plain: number[] = [];
  const first: number[] = [];
  const replyDone: number[] = [];
  const streamedTotal: number[] = [];
  for (let i = 0; i < LLM_RUNS; i++) {
    plain.push((await timed(() => client.responses.create(base)))[1]);
    const t0 = performance.now();
    let text = "";
    let firstAt: number | null = null;
    let replyAt: number | null = null;
    const stream = await client.responses.create({ ...base, stream: true });
    for await (const ev of stream) {
      if (ev.type !== "response.output_text.delta") continue;
      firstAt ??= performance.now() - t0;
      text += ev.delta;
      if (replyAt === null && REPLY_DONE.test(text)) replyAt = performance.now() - t0;
    }
    streamedTotal.push(performance.now() - t0);
    first.push(firstAt ?? NaN);
    replyDone.push(replyAt ?? NaN);
  }
  return { runs: LLM_RUNS, plainMs: stats(plain), streamFirstTokenMs: stats(first), streamReplyCompleteMs: stats(replyDone), streamTotalMs: stats(streamedTotal) };
}

it(
  "measures the voice pipeline and the LLM",
  async () => {
    const result = { ranAt: new Date().toISOString(), base: BASE, pipeline: await pipeline(), llm: await llmPlainVsStreamed() };
    mkdirSync("evals/results", { recursive: true });
    writeFileSync("evals/results/latency-latest.json", JSON.stringify(result, null, 2));
    expect(result.pipeline.turns).toBe(TURNS);
  },
  600_000,
);
