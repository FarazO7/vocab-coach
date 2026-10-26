import { describe, expect, it } from "vitest";
import { nextLevel, outcomeOf, type Outcome } from "./outcome";
import type { AttemptEv } from "./types";

const a = (p: Partial<AttemptEv>): AttemptEv => ({
  k: "attempt",
  key: "s:1:0",
  sid: "s",
  t: 0,
  day: "2026-10-26",
  item: "mitigate_v",
  mode: "elicit",
  hints: 0,
  revealed: false,
  repaired: false,
  fragment: false,
  targetUsed: true,
  uncertain: false,
  abandoned: false,
  asrMin: 0.9,
  modality: "voice",
  judge: { appropriate: true, confidence: 0.9, issue: "none" },
  utterance: "",
  ...p,
});
const no = { appropriate: false, confidence: 0.9, issue: "collocation" } as const;

describe("outcome table (brief §5)", () => {
  it.each<[string, Partial<AttemptEv>, Outcome]>([
    ["own sentence after SEED", { mode: "seed" }, { kind: "success", level: 4, rating: "Good" }],
    ["unhinted ELICIT, sentence", {}, { kind: "success", level: 4, rating: "Good" }],
    ["unhinted ELICIT, fragment", { fragment: true, judge: null }, { kind: "success", level: 3, rating: "Good" }],
    ["fragment ignores a mention_not_use verdict (D2)", { fragment: true, judge: { ...no, issue: "mention_not_use" } }, { kind: "success", level: 3, rating: "Good" }],
    ["after hint 1", { hints: 1 }, { kind: "success", level: 2, rating: "Hard" }],
    ["after hint 2", { hints: 2 }, { kind: "success", level: 2, rating: "Hard" }],
    ["after one self-repair (pinned)", { repaired: true }, { kind: "success", level: 4, rating: "Hard" }],
    ["seed sentence after repair", { mode: "seed", repaired: true }, { kind: "success", level: 4, rating: "Hard" }],
    ["needed hint 3", { hints: 3 }, { kind: "miss", level: null, rating: "Again" }],
    ["needed REVEAL", { revealed: true, hints: 3 }, { kind: "miss", level: null, rating: "Again" }],
    ["incorrect after repair", { repaired: true, judge: no }, { kind: "miss", level: null, rating: "Again" }],
    ["word never used (I6)", { repaired: true, targetUsed: false, judge: null }, { kind: "miss", level: null, rating: "Again" }],
    ["spontaneous, appropriate", { mode: "spontaneous" }, { kind: "success", level: 5, rating: "Easy" }],
    ["spontaneous, inappropriate (D5)", { mode: "spontaneous", judge: no }, { kind: "none", level: null, rating: null }],
    ["UNCERTAIN", { uncertain: true }, { kind: "uncertain", level: null, rating: null }],
    ["abandoned", { abandoned: true, targetUsed: false }, { kind: "none", level: null, rating: null }],
  ])("%s", (_, p, expected) => {
    expect(outcomeOf(a(p))).toEqual(expected);
  });

  it("uses the lowest level and the harsher rating when rows combine", () => {
    expect(outcomeOf(a({ hints: 2, repaired: true }))).toEqual({ kind: "success", level: 2, rating: "Hard" });
    expect(outcomeOf(a({ hints: 1, fragment: true }))).toEqual({ kind: "success", level: 2, rating: "Hard" });
  });
});

describe("ladder (brief §5, pinned miss rule)", () => {
  const success = (level: number): Outcome => ({ kind: "success", level, rating: "Good" });
  const miss: Outcome = { kind: "miss", level: null, rating: "Again" };
  const uncertain: Outcome = { kind: "uncertain", level: null, rating: null };

  it("success takes the max", () => {
    expect(nextLevel(4, success(2))).toBe(4);
    expect(nextLevel(2, success(4))).toBe(4);
  });

  it.each([
    [5, 4],
    [4, 3],
    [3, 2],
    [2, 2],
    [1, 1],
    [0, 0],
  ])("miss at level %i → %i", (from, to) => {
    expect(nextLevel(from, miss)).toBe(to);
  });

  it("UNCERTAIN never changes the level", () => {
    expect(nextLevel(3, uncertain)).toBe(3);
  });
});
