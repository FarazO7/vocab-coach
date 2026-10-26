import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getEnv } from "../../src/server/env";
import { openAiLlm, TURN_FORMAT } from "../../src/server/providers/llm";
import { goodTurn, jsonResponse, openAiBody, stubEnv, stubFetch } from "./stubs";

beforeEach(() => stubEnv());
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const call = () => openAiLlm(getEnv())({ instructions: "SYSTEM", input: "INPUT" });

describe("OpenAI adapter", () => {
  it("sends one strict structured-output request with reasoning off and nothing stored", async () => {
    const calls = stubFetch({ openai: () => jsonResponse(openAiBody(goodTurn())) });
    const out = await call();
    expect(out).toEqual({
      ok: true,
      value: goodTurn(),
      usage: { input_tokens: 900, cached_tokens: 0, cache_write_tokens: 0, output_tokens: 60, reasoning_tokens: 0 },
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://api.openai.com/v1/responses");
    const body = JSON.parse(String(calls[0]!.init.body));
    expect(body).toMatchObject({
      model: "gpt-6-luna",
      instructions: "SYSTEM",
      input: "INPUT",
      reasoning: { effort: "none" },
      store: false,
      text: { format: { type: "json_schema", name: "turn_result", strict: true } },
    });
  });

  it("uses a schema strict mode accepts: object root, all fields required, no string length keywords", () => {
    const schema = TURN_FORMAT.schema as Record<string, unknown>;
    expect(schema.type).toBe("object");
    expect(schema.additionalProperties).toBe(false);
    expect(schema.required).toEqual(["reply", "judgement", "spontaneous", "deferred_note", "learner_state"]);
    expect(JSON.stringify(schema)).not.toMatch(/"(minLength|maxLength)"/);
  });

  it.each([
    ["refusal", openAiBody("x", { output: [{ type: "message", id: "m", role: "assistant", status: "completed", content: [{ type: "refusal", refusal: "no" }] }] })],
    ["incomplete", openAiBody(goodTurn(), { status: "incomplete", incomplete_details: { reason: "max_output_tokens" } })],
    ["schema", openAiBody({ reply: "missing fields" })],
    ["schema", openAiBody("not json at all")],
  ])("reports %s without throwing", async (code, body) => {
    stubFetch({ openai: () => jsonResponse(body) });
    expect(await call()).toMatchObject({ ok: false, code });
  });

  it("reports an HTTP error and never retries on its own (D6)", async () => {
    const calls = stubFetch({ openai: () => jsonResponse({ error: { message: "boom" } }, 500) });
    expect(await call()).toMatchObject({ ok: false, code: "http_500" });
    expect(calls).toHaveLength(1);
  });

  it("reports a network failure as network", async () => {
    stubFetch({
      openai: () => {
        throw new TypeError("fetch failed");
      },
    });
    expect(await call()).toMatchObject({ ok: false, code: "network" });
  });
});
