// Prints the summary of the last latency pass (evals/results/latency-latest.json). Run by npm run eval:latency.
import { readFileSync } from "node:fs";

const r = JSON.parse(readFileSync(new URL("../evals/results/latency-latest.json", import.meta.url), "utf8"));
const s = (x) => `p50 ${x.p50} ms, p95 ${x.p95} ms (min ${x.min}, max ${x.max})`;
console.log(`Latency pass against ${r.base}, ${r.ranAt}`);
console.log(`Pipeline, ${r.pipeline.turns} turns (target: total p50 <= 2500 ms, p95 <= 4000 ms)`);
console.log(`  speech-to-text      ${s(r.pipeline.sttMs)}`);
console.log(`  /api/turn           ${s(r.pipeline.turnMs)}`);
console.log(`    of which LLM      ${s(r.pipeline.llmMs)}`);
console.log(`  TTS first byte      ${s(r.pipeline.ttsFirstMs)}`);
console.log(`  total               ${s(r.pipeline.totalMs)}`);
console.log(`LLM alone, ${r.llm.runs} runs each`);
console.log(`  plain request       ${s(r.llm.plainMs)}`);
console.log(`  streamed: first token     ${s(r.llm.streamFirstTokenMs)}`);
console.log(`  streamed: reply complete  ${s(r.llm.streamReplyCompleteMs)}`);
console.log(`  streamed: done            ${s(r.llm.streamTotalMs)}`);
