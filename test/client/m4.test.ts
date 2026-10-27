import { describe, expect, it } from "vitest";
import { advanceClock, DAY_MS, resetClock, Store, type Backend } from "../../src/client/store";
import { EMPTY_METER, PRICES, sessionCost } from "../../src/config/pricing";
import { replay } from "../../src/engine/replay";
import { awaitedVisible, type Await } from "../../src/engine/session";
import { Driver, plan, T0, voice } from "../helpers";

function memory(): Backend {
  const map = new Map<string, string>();
  return { get: (k) => map.get(k) ?? null, set: (k, v) => void map.set(k, v), remove: (k) => void map.delete(k), keys: () => [...map.keys()] };
}

describe("demo clock (brief §9, I13)", () => {
  it("moves forward by whole days", () => {
    const s = new Store(memory(), () => 0);
    advanceClock(s, 3);
    advanceClock(s, 1);
    expect(s.get().clockOffsetMs).toBe(4 * DAY_MS);
  });

  it("drops events dated after real time on reset, closes what that leaves open, and replays", () => {
    const past = new Driver([], plan({ seeds: ["meticulous_adj"] }), "past", T0);
    past.say(voice("Hello."));
    past.end();
    const ahead = new Driver(past.events, plan(), "ahead", T0 + 3 * DAY_MS);
    ahead.say(voice("Later."));
    ahead.end();
    const s = new Store(memory(), () => 0);
    s.update((d) => ({ ...d, clockOffsetMs: 3 * DAY_MS, events: ahead.events }));

    resetClock(s, T0 + DAY_MS);
    expect(s.get().clockOffsetMs).toBe(0);
    expect(s.get().events.some((e) => e.sid === "ahead")).toBe(false);
    expect(replay(s.get().events)).toEqual(replay(past.events));
  });
});

describe("Under the hood masking (D14)", () => {
  const a = (p: Partial<Await>): Await => ({ item: "x", mode: "elicit", hints: 0, revealed: false, reinvited: false, repairPrompted: false, clarified: false, ...p });
  it("names the awaited item only when the chip would", () => {
    expect(awaitedVisible(null)).toBe(true);
    expect(awaitedVisible(a({ mode: "seed" }))).toBe(true);
    expect([0, 1, 2].map((h) => awaitedVisible(a({ hints: h as 0 | 1 | 2 })))).toEqual([false, false, false]);
    expect(awaitedVisible(a({ hints: 3 }))).toBe(true);
    expect(awaitedVisible(a({ revealed: true }))).toBe(true);
  });
});

describe("cost meter (brief §9)", () => {
  it("prices measured usage with the listed rates", () => {
    const cost = sessionCost({ ...EMPTY_METER, sttSeconds: 90, ttsChars: 2000, inputTokens: 10_000, cachedTokens: 6_000, cacheWriteTokens: 1_000, outputTokens: 1_000 });
    expect(cost.stt).toBeCloseTo(1.5 * 0.0043, 10);
    expect(cost.tts).toBeCloseTo(2 * 0.03, 10);
    expect(cost.llm).toBeCloseTo((3_000 * 0.1 + 6_000 * 0.01 + 1_000 * 0.125 + 1_000 * 0.5) / 1e6, 12);
    expect(cost.total).toBeCloseTo(cost.stt + cost.tts + cost.llm, 12);
  });

  it("gives every price a source", () => {
    for (const p of Object.values(PRICES)) expect(p.source.length).toBeGreaterThan(5);
  });
});
