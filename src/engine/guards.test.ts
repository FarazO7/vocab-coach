import { describe, expect, it } from "vitest";
import { DEFAULTS } from "../config/defaults";
import { capWords, fixDashes, keepNote, leaksTarget, wordCount } from "./guards";
import { ALLOWLIST, getItem, LEXICON } from "./lexicon";
import { fallbackReply, hintOptions, recapLine } from "./templates";
import type { Directive } from "./types";

const d = (type: Directive["type"], item: string | null, hint: 0 | 1 | 2 | 3 = 0): Directive => ({
  type,
  item_id: item,
  hint_level: hint,
  repair_allowed: false,
});

describe("word cap guard (brief §6)", () => {
  it("leaves short replies alone", () => {
    expect(capWords("Nice one. What next?", 40)).toBe("Nice one. What next?");
  });
  it("cuts at a sentence boundary", () => {
    const text = `${"word ".repeat(30).trim()}. ${"more ".repeat(20).trim()}.`;
    expect(capWords(text, 40)).toBe(`${"word ".repeat(30).trim()}.`);
  });
  it("cuts at a word when the first sentence alone is too long", () => {
    const out = capWords(`${"long ".repeat(50).trim()}, really.`, 40);
    expect(wordCount(out)).toBe(40);
    expect(out.endsWith(".")).toBe(true);
  });
});

describe("target leak guard (brief §6, D7)", () => {
  const mitigate = getItem("mitigate_v");
  it("catches forms and variants", () => {
    expect(leaksTarget("How would you mitigate it?", mitigate)).toBe(true);
    expect(leaksTarget("A grueling trip?", getItem("gruelling_adj"))).toBe(true);
  });
  it("catches derivatives via the stem rule", () => {
    expect(leaksTarget("What about flood mitigation?", mitigate)).toBe(true);
    expect(leaksTarget("Is procrastination a habit?", getItem("procrastinate_v"))).toBe(true);
  });
  it("leaves unrelated words and short lemmas alone", () => {
    expect(leaksTarget("How can councils reduce flood damage?", mitigate)).toBe(false);
    expect(leaksTarget("Curiosity helps.", getItem("curb_v"))).toBe(false);
  });
  it("doesn't treat the first-sound hint as a leak", () => {
    expect(leaksTarget("It starts with 'mi-ti'.", mitigate)).toBe(false);
  });
});

describe("templated fallbacks (PLAN §2)", () => {
  it.each(LEXICON.map((i) => [i.id] as const))("%s: ELICIT, HINT 1, HINT 2 and CLARIFY never leak the target", (id) => {
    const item = getItem(id);
    const ctx = { item, topic: "travel" as const, sid: "s1" };
    for (const dir of [d("ELICIT", id), d("HINT", id, 1), d("HINT", id, 2), d("CLARIFY", id)]) {
      const line = fallbackReply(dir, ctx);
      expect(leaksTarget(line, item), line).toBe(false);
      expect(wordCount(line)).toBeLessThanOrEqual(DEFAULTS.replyWordCap);
    }
    for (const dir of [d("SEED", id), d("HINT", id, 3), d("REVEAL", id)])
      expect(wordCount(fallbackReply(dir, ctx))).toBeLessThanOrEqual(DEFAULTS.replyWordCap);
  });

  it("offers both hint-3 options in a fixed order per session", () => {
    const item = getItem("meticulous_adj");
    expect(hintOptions(item, "s1")).toEqual(hintOptions(item, "s1"));
    expect([...hintOptions(item, "s1")].sort()).toEqual(["careless", "meticulous"]);
    const firsts = new Set(["a", "b", "c", "d", "e", "f"].map((sid) => hintOptions(item, sid)[0]));
    expect(firsts.size).toBe(2);
  });

  it("builds a recap within 80 words", () => {
    const line = recapLine({
      learned: [{ item: "gruelling_adj", lemma: "gruelling", level: 4 }],
      hinted: [{ item: "meticulous_adj", lemma: "meticulous", nextDue: "2026-10-29" }],
      spontaneous: [{ item: "mitigate_v", lemma: "mitigate" }],
      polish: [{ said: "one and half hour", suggest: "an hour and a half" }],
      alternatives: [],
      uncertain: [],
      dueTomorrow: 3,
    });
    expect(line).toBe(
      'Well done today. You learned gruelling. meticulous needed a hint, so it comes back on Thursday. Big win: you used mitigate on your own. One phrase to polish: "an hour and a half". 3 words are due tomorrow.',
    );
    expect(wordCount(line)).toBeLessThanOrEqual(DEFAULTS.recapWordCap);
  });
});

describe("dashes and allowlist notes", () => {
  it("replaces em and en dashes (I18)", () => {
    expect(fixDashes("Nice \u2014 that works.")).toBe("Nice, that works.");
    expect(fixDashes("2\u20133 minutes")).toBe("2 to 3 minutes");
    expect(fixDashes("Good\u2014really good")).toBe("Good, really good");
  });
  it("drops a note that 'corrects' an allowlisted form (I17, DoD 5)", () => {
    expect(keepNote({ said: "we preponed it" }, ALLOWLIST)).toBe(false);
    expect(keepNote({ said: "I am out of station" }, ALLOWLIST)).toBe(false);
    expect(keepNote({ said: "do a discussion" }, ALLOWLIST)).toBe(true);
  });
});
