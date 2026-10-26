import { describe, expect, it } from "vitest";
import { leaksTarget, wordCount } from "./guards";
import { ALLOWLIST, confusable, LEXICON } from "./lexicon";
import { matchItem, tokensFromText } from "./matcher";

const matches = (text: string, item: (typeof LEXICON)[number]) => matchItem(tokensFromText(text), item) !== null;

describe("lexicon (brief §4 entry rules)", () => {
  it("has 40 unique items, all author-drafted and unreviewed", () => {
    expect(LEXICON).toHaveLength(40);
    expect(new Set(LEXICON.map((i) => i.id)).size).toBe(40);
    expect(new Set(LEXICON.map((i) => i.lemma)).size).toBe(40);
    expect(LEXICON.every((i) => i.source === "author-drafted" && i.reviewed === false)).toBe(true);
  });

  it.each(LEXICON.map((i) => [i.id, i] as const))("%s follows the entry rules", (_, item) => {
    expect(wordCount(item.definition_simple)).toBeLessThanOrEqual(12);
    expect(item.collocations).toHaveLength(2);
    for (const c of item.collocations) expect(matches(c, item), c).toBe(true);
    expect(matches(item.example, item), item.example).toBe(true);
    expect(matches(item.lemma, item)).toBe(true);
    // HINT 1 reads the definition aloud, so it must never give the word away.
    expect(leaksTarget(item.definition_simple, item), item.definition_simple).toBe(false);
    expect(matches(item.distractor, item)).toBe(false);
    expect(item.distractor.toLowerCase()).not.toBe(item.lemma.toLowerCase());
  });

  it("carries both GB and US spellings where they differ", () => {
    const byId = new Map(LEXICON.map((i) => [i.id, i]));
    expect(byId.get("gruelling_adj")?.spelling_variants).toContain("grueling");
    expect(byId.get("prioritise_v")?.spelling_variants).toContain("prioritize");
  });

  it("marks phrasal verbs for separability", () => {
    const pv = LEXICON.filter((i) => i.type === "phrasal_verb");
    expect(pv.map((i) => [i.id, i.separable])).toEqual([
      ["take_on_pv", true],
      ["cut_down_on_pv", false],
    ]);
  });

  it("has no confusables within a topic", () => {
    for (const a of LEXICON)
      for (const b of LEXICON)
        if (a.id !== b.id && a.topics.some((t) => b.topics.includes(t))) expect(confusable(a, b), `${a.id}/${b.id}`).toBe(false);
  });

  it("has no distractor that is another item in the same topic", () => {
    for (const a of LEXICON)
      for (const b of LEXICON)
        if (a.id !== b.id && a.topics.some((t) => b.topics.includes(t)))
          expect(a.distractor.toLowerCase(), `${a.id} -> ${b.id}`).not.toBe(b.lemma.toLowerCase());
  });
});

describe("dialect allowlist (brief §4)", () => {
  it("starts with the brief's twelve forms, all unreviewed", () => {
    expect(ALLOWLIST.map((e) => e.id)).toEqual([
      "prepone",
      "out_of_station",
      "do_the_needful",
      "cousin_brother_sister",
      "co_brother",
      "batchmate",
      "passed_out",
      "timepass",
      "have_a_doubt",
      "revert",
      "today_itself",
      "good_name",
    ]);
    expect(ALLOWLIST.every((e) => !e.reviewed)).toBe(true);
  });

  it("never overlaps a lexicon target", () => {
    for (const e of ALLOWLIST) for (const item of LEXICON) for (const f of e.forms) expect(matches(f, item), `${f}/${item.id}`).toBe(false);
  });
});
