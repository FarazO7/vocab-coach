import { describe, expect, it } from "vitest";
import { dayOf } from "./days";
import { getItem, LEXICON } from "./lexicon";
import { planSession, seedPriority, sessionTopic } from "./planner";
import { Driver, judged, plan, seededHistory, T0, voice } from "../../test/helpers";
import { dueItems, replay } from "./replay";
import type { Ev, Profile } from "./types";

const TZ = -330;
const DAY = 86_400_000;
const T = Date.parse("2026-10-26T10:00:00+05:30");
const today = dayOf(T, TZ);
const profile: Profile = { name: "", exam: "IELTS", level: "B1", interests: ["work_study"], testDate: null };

/** n past sessions on day -3, each seeding one item with a Good seed sentence (due on day 0). */
function pastSeeds(ids: string[], dayOffset = -3): Ev[] {
  return ids.flatMap((id, i) => {
    const sid = `p${i}`;
    const t = T + dayOffset * DAY + i * 60_000;
    const day = dayOf(t, TZ);
    return [
      { k: "session_start", key: `${sid}:0:0`, sid, t, day, topic: "work_study", budgetS: 600, plan: { due: [], seeds: [] } },
      { k: "seed", key: `${sid}:1:0`, sid, t: t + 1, day, item: id },
      {
        k: "attempt",
        key: `${sid}:2:0`,
        sid,
        t: t + 2,
        day,
        item: id,
        mode: "seed",
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
      },
      { k: "session_end", key: `${sid}:end`, sid, t: t + 3, day },
    ] as Ev[];
  });
}

describe("seed priority (brief §5, research weights)", () => {
  it("matches a hand calculation", () => {
    // meticulous: C1 vs B1 → gap 2/3; band 2 → usefulness 0.5; work_study is an interest.
    expect(seedPriority(getItem("meticulous_adj"), profile, "work_study")).toBeCloseTo(0.35 + 0.2 + 0.075 + 0.1 - 0.1, 10);
    // hectic: B2 vs B1 → gap 1/3; band 1; not an interest.
    expect(seedPriority(getItem("hectic_adj"), profile, "work_study")).toBeCloseTo(0.35 + 0.2 + 0.15 + 0 - 0.05, 10);
  });
  it("treats 'not sure' as B1", () => {
    const item = getItem("mitigate_v");
    expect(seedPriority(item, { ...profile, level: "not_sure" }, "travel")).toBe(seedPriority(item, profile, "travel"));
  });
});

describe("planner (brief §5)", () => {
  it("first session: 6 minutes, 2 seeds, highest priority first with ties in lexicon order", () => {
    const p = planSession({ model: replay([]), profile, today, now: T });
    expect(p.budgetS).toBe(360);
    expect(p.topic).toBe("work_study");
    const ranked = LEXICON.map((i) => ({ id: i.id, p: seedPriority(i, profile, "work_study") }))
      .sort((a, b) => b.p - a.p)
      .slice(0, 2)
      .map((x) => x.id);
    expect(p.seeds).toEqual(ranked);
    expect(p.seeds).toEqual(["demanding_adj", "take_on_pv"]);
  });

  it("later sessions: 10 minutes and up to 3 seeds", () => {
    const p = planSession({ model: replay(pastSeeds(["mitigate_v"], -1)), profile, today, now: T });
    expect(p.budgetS).toBe(600);
    expect(p.seeds).toHaveLength(3);
  });

  it("caps due items at 6 and keeps seeding at exactly 8 due", () => {
    const eight = LEXICON.slice(0, 8).map((i) => i.id);
    const p = planSession({ model: replay(pastSeeds(eight)), profile, today, now: T });
    expect(p.dueTotal).toBe(8);
    expect(p.due).toHaveLength(6);
    expect(p.seeds.length).toBeGreaterThan(0);
  });

  it("stops seeding when more than 8 are due", () => {
    const nine = LEXICON.slice(0, 9).map((i) => i.id);
    expect(planSession({ model: replay(pastSeeds(nine)), profile, today, now: T }).seeds).toEqual([]);
  });

  it("never seeds an item confusable with one reviewed today", () => {
    // setback and drawback list each other as confusables; setback is due today.
    const p = planSession({ model: replay(pastSeeds(["setback_n"])), profile: { ...profile, interests: ["technology"] }, today, now: T });
    expect(p.due).toEqual(["setback_n"]);
    expect(p.seeds).not.toContain("drawback_n");
  });

  it("puts a Practise now item first", () => {
    const p = planSession({ model: replay(pastSeeds(["hectic_adj"], -1)), profile, today, now: T, practise: "hectic_adj" });
    expect(p.due[0]).toBe("hectic_adj");
  });

  it("adds one unannounced day-7 probe for an item that isn't due (I24)", () => {
    // Seeded 9 days ago (Good, due 3 days later), then reviewed Good 6 days ago, so its next review is still ahead.
    const seeded = seededHistory("hectic_adj", 9, "s-9");
    const review = new Driver(seeded, plan({ due: ["hectic_adj"] }), "s-6", T0 - 6 * DAY);
    review.say(voice("Busy week."));
    review.say(voice("My week was hectic with exams."), { judgement: judged(true) });
    review.end();
    const model = replay(review.events);
    expect(dueItems(model, today, T)).toEqual([]);
    const p = planSession({ model, profile, today, now: T });
    expect(p.probe).toBe("hectic_adj");
    expect(p.due).toEqual(["hectic_adj"]);
  });

  it("probes nothing younger than 7 days, and nothing already used after day 7", () => {
    expect(planSession({ model: replay(pastSeeds(["hectic_adj"], -6)), profile, today, now: T }).probe).toBeNull();
    const seeded = seededHistory("hectic_adj", 9, "s-9");
    const late = new Driver(seeded, plan({ due: ["hectic_adj"] }), "s-1", T0 - DAY);
    late.say(voice("Busy week."));
    late.say(voice("My week was hectic with exams."), { judgement: judged(true) });
    late.end();
    expect(replay(late.events).items["hectic_adj"]?.usedLater).toBe(true);
    expect(planSession({ model: replay(late.events), profile, today, now: T }).probe).toBeNull();
  });

  it("keeps a probe's outcome as evidence only: no FSRS change, but it feeds 'still used after 7 days'", () => {
    const seeded = seededHistory("hectic_adj", 9, "s-9");
    const review = new Driver(seeded, plan({ due: ["hectic_adj"] }), "s-6", T0 - 6 * DAY);
    review.say(voice("Busy week."));
    review.say(voice("My week was hectic with exams."), { judgement: judged(true) });
    review.end();
    const before = replay(review.events).items["hectic_adj"]!;
    const probe = new Driver(review.events, planSession({ model: replay(review.events), profile, today, now: T }), "s0", T0);
    expect(probe.say(voice("Long day today."))).toMatchObject({ type: "ELICIT", item_id: "hectic_adj" });
    probe.say(voice("Today was so hectic at the office."), { judgement: judged(true) });
    const after = probe.end().items["hectic_adj"]!;
    expect(after.card).toEqual(before.card);
    expect(after.usedLater).toBe(true);
  });

  it("rotates the session topic through chosen interests (I9)", () => {
    const two: Profile = { ...profile, interests: ["travel", "education"] };
    expect([0, 1, 2].map((n) => sessionTopic(two, n))).toEqual(["travel", "education", "travel"]);
    expect(sessionTopic({ ...profile, interests: [] }, 2)).toBe("environment");
  });
});
