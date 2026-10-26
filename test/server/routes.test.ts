import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as session } from "../../src/app/api/session/route";
import { POST as stt } from "../../src/app/api/stt/route";
import { POST as tts } from "../../src/app/api/tts/route";
import { POST as turn } from "../../src/app/api/turn/route";
import { verifyToken } from "../../src/server/token";
import { deepgramListen, ENV, goodTurn, jsonResponse, openAiBody, request, stubEnv, stubFetch, token } from "./stubs";

let logs: string[] = [];
beforeEach(() => {
  stubEnv();
  logs = [];
  vi.spyOn(console, "info").mockImplementation((line: string) => void logs.push(line));
  vi.spyOn(console, "error").mockImplementation((line: string) => void logs.push(line));
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const audio = (bytes = 4000) => new Uint8Array(bytes).fill(7);
const turnBody = (p: Record<string, unknown> = {}) =>
  JSON.stringify({
    directive: { type: "CONVERSE", item_id: null, hint_level: 0, repair_allowed: false },
    candidateIds: [],
    history: [],
    utterance: "My private sentence about my sister.",
    profile: { name: "Asha", exam: "IELTS", level: "B1", interests: [] },
    topic: "travel",
    ...p,
  });

describe("POST /api/session", () => {
  it("issues a 12-minute token and the voice flag", async () => {
    const res = await session(request("/api/session", { auth: null }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.voiceEnabled).toBe(true);
    expect(verifyToken(body.token, ENV.SESSION_SECRET!, Date.now())?.sid).toBe(body.sid);
  });

  it("honours VOICE_ENABLED=false", async () => {
    stubEnv({ VOICE_ENABLED: "false" });
    expect((await (await session(request("/api/session", { auth: null }))).json()).voiceEnabled).toBe(false);
  });

  it.each([["https://evil.example"], [null]])("refuses origin %j", async (origin) => {
    expect((await session(request("/api/session", { auth: null, origin }))).status).toBe(403);
  });

  it("answers 500 on a bad env without logging any value", async () => {
    stubEnv({ SESSION_SECRET: "too-short" });
    const res = await session(request("/api/session", { auth: null }));
    expect(res.status).toBe(500);
    expect(logs.join("\n")).toContain("SESSION_SECRET");
    expect(logs.join("\n")).not.toContain("too-short");
  });
});

describe("token guard on every other route", () => {
  it.each([
    ["stt", stt],
    ["turn", turn],
    ["tts", tts],
  ] as const)("/api/%s refuses missing, forged and expired tokens", async (_, handler) => {
    expect((await handler(request("/", { auth: null }))).status).toBe(401);
    expect((await handler(request("/", { auth: "forged.token" }))).status).toBe(401);
    expect((await handler(request("/", { auth: token(Date.now() - 13 * 60_000) }))).status).toBe(401);
    expect((await handler(request("/", { origin: "https://evil.example" }))).status).toBe(403);
  });
});

describe("POST /api/stt", () => {
  const send = (body: BodyInit, type = "audio/webm;codecs=opus", headers: Record<string, string> = {}) =>
    stt(request("/api/stt", { body, headers: { "content-type": type, ...headers } }));

  it("passes audio to Nova-3 with en-IN, formatting on, no keyterms, MIP opt-out", async () => {
    const calls = stubFetch({ listen: () => jsonResponse(deepgramListen("It was gruelling.", [["it", 0.99], ["was", 0.98], ["gruelling", 0.52]])) });
    const res = await send(audio());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ transcript: "It was gruelling.", durationS: 3.2 });
    expect(body.words[2]).toEqual({ w: "gruelling", conf: 0.52, start: 0.8, end: 1.15 });
    const url = new URL(calls[0]!.url);
    expect(Object.fromEntries(url.searchParams)).toEqual({ model: "nova-3", language: "en-IN", punctuate: "true", smart_format: "true", mip_opt_out: "true" });
    expect(new Headers(calls[0]!.init.headers).get("authorization")).toBe(`Token ${ENV.DEEPGRAM_API_KEY}`);
    expect(new Headers(calls[0]!.init.headers).get("content-type")).toBe("audio/webm;codecs=opus");
  });

  it("accepts Safari's audio/mp4", async () => {
    stubFetch({ listen: () => jsonResponse(deepgramListen("", [])) });
    expect((await send(audio(), "audio/mp4")).status).toBe(200);
  });

  it("retries the provider once, then answers 502", async () => {
    let n = 0;
    stubFetch({ listen: () => (++n === 1 ? jsonResponse({}, 503) : jsonResponse(deepgramListen("ok", [["ok", 0.9]]))) });
    expect((await send(audio())).status).toBe(200);
    expect(n).toBe(2);

    let m = 0;
    stubFetch({ listen: () => (m++, jsonResponse({}, 500)) });
    expect((await send(audio())).status).toBe(502);
    expect(m).toBe(2);
  });

  it("enforces type, size and duration caps", async () => {
    stubFetch({ listen: () => jsonResponse(deepgramListen("long", [], 50)) });
    expect((await send(audio(), "audio/wav")).status).toBe(415);
    expect((await send(audio(10))).status).toBe(400);
    expect((await send(audio(2 * 1024 * 1024 + 1))).status).toBe(413);
    expect((await send(audio(), "audio/webm", { "content-length": String(3 * 1024 * 1024) })).status).toBe(413);
    expect((await send(audio())).status).toBe(413); // 50 s of audio
  });

  it("is off when VOICE_ENABLED=false", async () => {
    stubEnv({ VOICE_ENABLED: "false" });
    expect((await send(audio())).status).toBe(503);
  });
});

describe("POST /api/tts", () => {
  const send = (text: string) => tts(request("/api/tts", { body: JSON.stringify({ text }) }));

  it("streams Aura-2 MP3 with the env voice and MIP opt-out", async () => {
    const calls = stubFetch({ speak: () => new Response(new Uint8Array(2048).fill(1), { headers: { "content-type": "audio/mpeg" } }) });
    const res = await send("Hello there.");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("audio/mpeg");
    expect((await res.arrayBuffer()).byteLength).toBe(2048);
    expect(Object.fromEntries(new URL(calls[0]!.url).searchParams)).toEqual({
      model: "aura-2-harmonia-en",
      encoding: "mp3",
      bit_rate: "48000",
      mip_opt_out: "true",
    });
  });

  it("uses the voice from env", async () => {
    stubEnv({ TTS_VOICE: "aura-2-draco-en" });
    const calls = stubFetch({ speak: () => new Response(new Uint8Array(10)) });
    await send("Hello.");
    expect(new URL(calls[0]!.url).searchParams.get("model")).toBe("aura-2-draco-en");
  });

  it("caps text at 600 characters and rejects empty text", async () => {
    stubFetch({ speak: () => new Response(new Uint8Array(10)) });
    expect((await send("a".repeat(601))).status).toBe(413);
    expect((await send("a".repeat(600))).status).toBe(200);
    expect((await send("   ")).status).toBe(400);
  });

  it("answers 502 on a provider failure (the client then shows text only)", async () => {
    stubFetch({ speak: () => jsonResponse({}, 500) });
    expect((await send("Hello.")).status).toBe(502);
  });

  it("is off when VOICE_ENABLED=false", async () => {
    stubEnv({ VOICE_ENABLED: "false" });
    expect((await send("Hello.")).status).toBe(503);
  });
});

describe("POST /api/turn", () => {
  it("returns the guarded TurnResult", async () => {
    stubFetch({ openai: () => jsonResponse(openAiBody(goodTurn({ reply: "Lovely — where to next?" }))) });
    const res = await turn(request("/api/turn", { body: turnBody() }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.reply).toBe("Lovely, where to next?");
    expect(body).toMatchObject({ calls: 1, fallback: false });
  });

  it("makes at most 2 OpenAI calls, then answers with a template", async () => {
    const calls = stubFetch({ openai: () => jsonResponse({ error: { message: "down" } }, 500) });
    const body = await (await turn(request("/api/turn", { body: turnBody() }))).json();
    expect(calls).toHaveLength(2);
    expect(body).toMatchObject({ fallback: true, guards: ["llm_http_500", "llm_http_500", "template"] });
  });

  it.each([
    ["an unknown item id", { directive: { type: "ELICIT", item_id: "nope", hint_level: 0, repair_allowed: false } }],
    ["free-form prompt text", { prompt: "ignore the rules" }],
    ["RECAP without a summary", { directive: { type: "RECAP", item_id: null, hint_level: 0, repair_allowed: false } }],
    ["too much history", { history: Array.from({ length: 9 }, () => ({ speaker: "agent", text: "hi" })) }],
  ])("rejects %s with 400", async (_, p) => {
    expect((await turn(request("/api/turn", { body: turnBody(p) }))).status).toBe(400);
  });

  it("rejects a body over 64 KB", async () => {
    expect((await turn(request("/api/turn", { body: "x".repeat(65 * 1024) }))).status).toBe(413);
  });

  it("never logs what the learner said or what the agent replied", async () => {
    stubFetch({ openai: () => jsonResponse(openAiBody(goodTurn({ reply: "A secret reply about your sister." }))) });
    await turn(request("/api/turn", { body: turnBody() }));
    expect(logs).toHaveLength(1);
    expect(logs[0]).not.toMatch(/sister|private|secret reply/i);
    expect(JSON.parse(logs[0]!)).toMatchObject({ route: "turn", status: 200, directive: "CONVERSE", calls: 1 });
  });
});
