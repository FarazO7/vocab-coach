// Brief §12 M2: hits every route against real providers and prints latencies.
// Usage: npm run smoke                       (local, needs `npm run dev` running)
//        npm run smoke -- https://your.app   (deployed)
import { readFileSync } from "node:fs";

const BASE = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
const audio = readFileSync(new URL("./fixtures/commute.m4a", import.meta.url));
const results = [];
let failed = 0;

function check(name, ok, detail = "") {
  if (!ok) failed += 1;
  results.push(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  ${detail}` : ""}`);
}

async function post(path, { token, body, type = "application/json", origin = BASE } = {}) {
  const started = performance.now();
  const headers = { Origin: origin, "Content-Type": type };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { method: "POST", headers, body });
  const ms = Math.round(performance.now() - started);
  return { res, ms };
}

const words = (s) => s.trim().split(/\s+/).filter(Boolean).length;
const profile = { name: "Smoke", exam: "IELTS", level: "B1", interests: ["city_transport"] };
const turn = (directive, utterance, extra = {}) =>
  JSON.stringify({ directive, candidateIds: [], history: [], utterance, profile, topic: "city_transport", ...extra });

// 1. Session token, and the two refusals every other route relies on.
const session = await post("/api/session", { body: "{}" });
const s = session.res.ok ? await session.res.json() : {};
check("session issues a token", session.res.status === 200 && typeof s.token === "string", `${session.ms} ms, voiceEnabled=${s.voiceEnabled}`);
check("session refuses a foreign origin", (await post("/api/session", { body: "{}", origin: "https://evil.example" })).res.status === 403);
check("turn refuses a missing token", (await post("/api/turn", { body: turn({ type: "CONVERSE", item_id: null, hint_level: 0, repair_allowed: false }, "") })).res.status === 401);

// 2. Speech to text on a synthetic clip that contains a target word.
const stt = await post("/api/stt", { token: s.token, body: audio, type: "audio/mp4" });
const t = stt.res.ok ? await stt.res.json() : { transcript: "", words: [] };
const target = t.words.find((w) => /^gruel+ing$/.test(w.w));
check("stt transcribes the clip", stt.res.status === 200 && t.transcript.length > 0, `${stt.ms} ms, "${t.transcript}"`);
check("stt returns per-word confidence for the target", Boolean(target), target ? `gruelling conf=${target.conf.toFixed(2)}` : "target not heard");

// 3. LLM turns: a SEED, a JUDGE that must carry a judgement, and an ELICIT that must not leak the word.
const turnMs = [];
async function runTurn(name, directive, utterance, expect) {
  const r = await post("/api/turn", { token: s.token, body: turn(directive, utterance) });
  const out = r.res.ok ? await r.res.json() : null;
  turnMs.push(r.ms);
  const reply = out?.result.reply ?? "";
  check(
    name,
    r.res.status === 200 && !out.fallback && words(reply) <= 40 && !reply.includes("—") && expect(out),
    `${r.ms} ms (llm ${out?.llmMs} ms, calls ${out?.calls}, guards [${out?.guards.join(", ")}]) "${reply}"`,
  );
  return out;
}
const seed = await runTurn("turn SEED", { type: "SEED", item_id: "gruelling_adj", hint_level: 0, repair_allowed: false }, t.transcript || "My commute is two hours.", () => true);
await runTurn(
  "turn JUDGE returns a judgement",
  { type: "JUDGE", item_id: "gruelling_adj", hint_level: 0, repair_allowed: true },
  "Two hours on a crowded train every day is a gruelling commute.",
  (o) => o.result.judgement !== null,
);
await runTurn(
  "turn ELICIT doesn't say the word",
  { type: "ELICIT", item_id: "bottleneck_n", hint_level: 0, repair_allowed: false },
  "The traffic near the flyover is terrible every evening.",
  (o) => !/bottleneck/i.test(o.result.reply),
);

// 4. Text to speech on the SEED reply.
const tts = await post("/api/tts", { token: s.token, body: JSON.stringify({ text: seed?.result.reply ?? "Hello there." }) });
const mp3 = tts.res.ok ? new Uint8Array(await tts.res.arrayBuffer()) : new Uint8Array();
check("tts returns MP3", tts.res.status === 200 && tts.res.headers.get("content-type") === "audio/mpeg" && mp3.length > 1000, `${tts.ms} ms, ${(mp3.length / 1024).toFixed(0)} KB`);

console.log(`Smoke test against ${BASE}\n`);
console.log(results.join("\n"));
console.log(`\nLatency: stt ${stt.ms} ms | turn ${turnMs.join(" / ")} ms | tts ${tts.ms} ms`);
console.log(`Approximate one-turn total: ${stt.ms + (turnMs[0] ?? 0) + tts.ms} ms (stt + first turn + tts, full download)`);
process.exit(failed ? 1 : 0);
