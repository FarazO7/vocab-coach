import { describe, expect, it } from "vitest";
import { getItem } from "./lexicon";
import { matchItem, normalise, tokensFromText, tokensFromWords } from "./matcher";

const m = (text: string, id: string) => matchItem(tokensFromText(text), getItem(id));

describe("matcher (brief §5)", () => {
  it("normalises case, apostrophes, punctuation and hyphens", () => {
    expect(normalise("It’s Hands-On, really!")).toEqual(["it's", "hands", "on", "really"]);
  });

  it("matches every inflection and spelling variant", () => {
    expect(m("Councils mitigated the damage", "mitigate_v")).not.toBeNull();
    expect(m("A grueling commute", "gruelling_adj")).not.toBeNull();
    expect(m("I prioritized sleep", "prioritise_v")).not.toBeNull();
    expect(m("Mitigation matters", "mitigate_v")).toBeNull();
  });

  it("matches phrases contiguously", () => {
    expect(m("Urban sprawl is a problem", "urban_sprawl_n")).not.toBeNull();
    expect(m("Urban areas sprawl", "urban_sprawl_n")).toBeNull();
    expect(m("I cut down on sugar", "cut_down_on_pv")).not.toBeNull();
    expect(m("I cut sugar down on weekends", "cut_down_on_pv")).toBeNull();
  });

  it("allows up to three tokens between verb and particle for separable verbs", () => {
    expect(m("I took on extra work", "take_on_pv")).not.toBeNull();
    expect(m("I'll take it on", "take_on_pv")).not.toBeNull();
    expect(m("I'll take the new project on", "take_on_pv")).not.toBeNull();
    expect(m("I'll take the big new project on", "take_on_pv")).toBeNull();
    expect(m("I immersed myself fully in the culture", "immerse_yourself_in_phr")).not.toBeNull();
  });

  it("treats hyphenated and spaced compounds alike", () => {
    expect(m("hands on experience", "hands_on_adj")).not.toBeNull();
    expect(matchItem(tokensFromWords([{ w: "hands-on", conf: 0.8 }]), getItem("hands_on_adj"))?.minConf).toBe(0.8);
  });

  it("returns the span and the lowest confidence among the item's own tokens", () => {
    const tokens = [
      { w: "take", conf: 0.9 },
      { w: "the", conf: 0.2 },
      { w: "job", conf: 0.3 },
      { w: "on", conf: 0.7 },
    ];
    expect(matchItem(tokens, getItem("take_on_pv"))).toEqual({ start: 0, end: 4, minConf: 0.7 });
  });

  it("prefers the most confidently heard occurrence", () => {
    const tokens = [
      { w: "curb", conf: 0.3 },
      { w: "and", conf: 0.9 },
      { w: "curb", conf: 0.8 },
    ];
    expect(matchItem(tokens, getItem("curb_v"))?.minConf).toBe(0.8);
  });

  it("gives typed input confidence 1.0", () => {
    expect(m("detrimental to health", "detrimental_adj")?.minConf).toBe(1);
  });
});
