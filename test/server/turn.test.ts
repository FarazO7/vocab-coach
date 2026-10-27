import { describe, expect, it } from "vitest";
import { ZERO_USAGE, type LlmCall, type LlmOutcome } from "../../src/server/providers/llm";
import { TurnRequestSchema, type TurnRequest } from "../../src/server/schemas";
import { runTurn } from "../../src/server/turn";
import { goodTurn } from "./stubs";

const req = (directive: TurnRequest["directive"], p: Partial<TurnRequest> = {}): TurnRequest =>
  TurnRequestSchema.parse({
    directive,
    candidateIds: [],
    history: [],
    utterance: "The traffic was terrible today.",
    profile: { name: "", exam: "IELTS", level: "B1", interests: [] },
    topic: "city_transport",
    ...p,
  });

const ELICIT = { type: "ELICIT", item_id: "bottleneck_n", hint_level: 0, repair_allowed: false } as const;
const JUDGE = { type: "JUDGE", item_id: "bottleneck_n", hint_level: 0, repair_allowed: true } as const;
const CONVERSE = { type: "CONVERSE", item_id: null, hint_level: 0, repair_allowed: false } as const;

const ok = (p: Record<string, unknown> = {}): LlmOutcome => ({ ok: true, value: goodTurn(p), usage: { ...ZERO_USAGE, input_tokens: 100, output_tokens: 20 } });
const err = (code: string): LlmOutcome => ({ ok: false, code, usage: ZERO_USAGE });

/** A fake LLM that plays back the given outcomes and counts calls. */
function fake(...outcomes: LlmOutcome[]): LlmCall & { calls: number } {
  const f = Object.assign(
    async () => {
      f.calls += 1;
      return outcomes[Math.min(f.calls - 1, outcomes.length - 1)]!;
    },
    { calls: 0 },
  );
  return f;
}

const long = (n: number) => `${Array.from({ length: n }, () => "word").join(" ")}.`;

describe("turn guards (brief §6, D6)", () => {
  it("passes a good reply through, fixing dashes and dropping out-of-scope fields", async () => {
    const llm = fake(
      ok({
        reply: "Where does it get stuck — near the flyover?",
        judgement: { appropriate: true, confidence: 0.9, issue: "none" },
        spontaneous: [
          { item_id: "gruelling_adj", appropriate: true, confidence: 0.9 },
          { item_id: "hectic_adj", appropriate: true, confidence: 0.9 },
        ],
        deferred_note: { said: "we preponed it", suggest: "we brought it forward" },
      }),
    );
    const out = await runTurn(req(ELICIT, { candidateIds: ["gruelling_adj"] }), "sid", llm);
    expect(out.result).toEqual({
      reply: "Where does it get stuck, near the flyover?",
      judgement: null, // only JUDGE carries a judgement
      spontaneous: [{ item_id: "gruelling_adj", appropriate: true, confidence: 0.9 }], // only real candidates
      deferred_note: null, // never "correct" an allowlisted form
      learner_state: "ok",
    });
    expect(out).toMatchObject({ calls: 1, guards: [], fallback: false, usage: { input_tokens: 100, output_tokens: 20 } });
  });

  it("strips Markdown before the leak check, so a bolded target is still caught", async () => {
    const out = await runTurn(req(ELICIT), "sid", fake(ok({ reply: "Is there a **bottleneck** near you?" }), ok({ reply: "Where does **traffic** get stuck?" })));
    expect(out.guards).toEqual(["leak"]);
    expect(out.result.reply).toBe("Where does traffic get stuck?");
  });

  it("keeps the judgement for JUDGE", async () => {
    const out = await runTurn(req(JUDGE), "sid", fake(ok({ judgement: { appropriate: false, confidence: 0.8, issue: "collocation" } })));
    expect(out.result.judgement).toEqual({ appropriate: false, confidence: 0.8, issue: "collocation" });
  });

  it("regenerates once on a leak, then falls back to the lexicon template", async () => {
    const leaky = ok({ reply: "Is there a bottleneck near you?" });
    const once = await runTurn(req(ELICIT), "sid", fake(leaky, ok({ reply: "Where does traffic always get stuck?" })));
    expect(once).toMatchObject({ calls: 2, guards: ["leak"], fallback: false });

    const twice = await runTurn(req(ELICIT), "sid", fake(leaky, leaky));
    expect(twice).toMatchObject({ calls: 2, guards: ["leak", "leak", "template"], fallback: true });
    expect(twice.result.reply).toBe(
      "Think of a noun that means 'a narrow point where traffic or work slows down'. Can you use it in a sentence about city life and transport?",
    );
  });

  it("catches derivatives too (D7)", async () => {
    const out = await runTurn(req({ ...ELICIT, item_id: "congested_adj" }), "sid", fake(ok({ reply: "How bad is the congestion?" }), ok()));
    expect(out.guards).toEqual(["leak"]);
  });

  it("doesn't treat the word as a leak at hint 3, where it is one of the options", async () => {
    const out = await runTurn(req({ type: "HINT", item_id: "bottleneck_n", hint_level: 3, repair_allowed: false }), "sid", fake(ok({ reply: "Is it bottleneck or shortcut?" })));
    expect(out).toMatchObject({ calls: 1, guards: [] });
  });

  it("regenerates once when over the word cap, then cuts at a sentence boundary", async () => {
    const tooLong = ok({ reply: `${long(30)} ${long(20)}` });
    const out = await runTurn(req(CONVERSE), "sid", fake(tooLong, tooLong));
    expect(out.guards).toEqual(["over_cap", "over_cap", "cut"]);
    expect(out.result.reply).toBe(long(30));
  });

  it("cuts the first reply if the regeneration fails", async () => {
    const out = await runTurn(req(CONVERSE), "sid", fake(ok({ reply: `${long(30)} ${long(20)}` }), err("timeout")));
    expect(out.guards).toEqual(["over_cap", "llm_timeout", "cut"]);
    expect(out.fallback).toBe(false);
  });

  it("allows 80 words for RECAP", async () => {
    const summary = { learned: [], hinted: [], spontaneous: [], polish: [], alternatives: [], uncertain: [], dueTomorrow: 0 };
    const out = await runTurn(req({ type: "RECAP", item_id: null, hint_level: 0, repair_allowed: false }, { summary }), "sid", fake(ok({ reply: long(70) })));
    expect(out.guards).toEqual([]);
  });

  it.each(["timeout", "schema", "refusal", "incomplete", "http_500"])("retries once on %s, then uses a template", async (code) => {
    const llm = fake(err(code), err(code), ok());
    const out = await runTurn(req(JUDGE), "sid", llm);
    expect(llm.calls).toBe(2); // never a third call
    expect(out).toMatchObject({ fallback: true, guards: [`llm_${code}`, `llm_${code}`, "template"] });
    expect(out.result.judgement).toBeNull(); // so the engine marks the attempt UNCERTAIN
  });

  it("treats a reply that breaks the length caps as a schema failure", async () => {
    const out = await runTurn(req(CONVERSE), "sid", fake(ok({ reply: "x".repeat(1001) }), ok()));
    expect(out.guards).toEqual(["llm_schema"]);
  });

  it("builds the RECAP template from the typed summary", async () => {
    const summary = { learned: [{ item: "gruelling_adj", level: 4 }], hinted: [], spontaneous: [], polish: [], alternatives: [], uncertain: [], dueTomorrow: 3 };
    const out = await runTurn(req({ type: "RECAP", item_id: null, hint_level: 0, repair_allowed: false }, { summary }), "sid", fake(err("timeout")));
    expect(out.result.reply).toBe("Well done today. You learned gruelling. 3 words are due tomorrow.");
  });
});
