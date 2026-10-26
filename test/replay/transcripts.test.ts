import { describe, expect, it } from "vitest";
import { addDays } from "../../src/engine/days";
import { leaksTarget } from "../../src/engine/guards";
import { getItem } from "../../src/engine/lexicon";
import { outcomeOf } from "../../src/engine/outcome";
import { replay } from "../../src/engine/replay";
import { buildSummary } from "../../src/engine/summary";
import { attempts, clockAt, dontKnow, Driver, judged, plan, seededHistory, voice } from "../helpers";

// Replay tests (brief §12 M1): scripted learner turns with mocked LLM output, based on research §5
// transcripts A, C and D, plus an UNCERTAIN case and a spontaneous-use case.

const typesOf = (d: Driver) => d.directives.map((x) => `${x.type}${x.type === "HINT" ? x.hint_level : ""}`);
const sessionAttempts = (d: Driver) => attempts(d.events.filter((e) => e.sid === d.state.sid));

describe("transcript A: new word with one self-repair", () => {
  const M = "mitigate_v";
  const d = new Driver([], plan({ topic: "environment", seeds: [M] }), "s1", undefined, "Hi! How's the weather where you live?");
  d.say(voice("Last monsoon our street flooded badly."), {
    reply:
      "You mentioned last monsoon's floods. Councils try to mitigate flood damage, meaning make it less severe. People say 'mitigate the risk'. How would you use it?",
  });
  d.say(voice("The government should mitigate the flood?"), {
    judgement: judged(false, 0.85, "collocation"),
    reply: "Nearly. We mitigate the damage, not the flood. Try again?",
  });
  d.say(voice("The government should mitigate flood damage by cleaning drains."), {
    judgement: judged(true, 0.9),
    reply: "Perfect. Does your area get waterlogged?",
  });
  const today = clockAt(d.t).day;
  const model = d.end();

  it("runs SEED, then JUDGE with a repair allowed, then JUDGE without", () => {
    expect(typesOf(d)).toEqual(["CONVERSE", "SEED", "JUDGE", "JUDGE"]);
    expect(d.directives.slice(2).map((x) => x.repair_allowed)).toEqual([true, false]);
  });

  it("logs prompted use after a self-repair: level 4, Hard", () => {
    const [a] = sessionAttempts(d);
    expect(a).toMatchObject({ mode: "seed", repaired: true });
    expect(outcomeOf(a!)).toEqual({ kind: "success", level: 4, rating: "Hard" });
  });

  it("schedules the seed sentence when the session ends before the Stretch", () => {
    expect(model.items[M]).toMatchObject({ level: 4, dueDay: addDays(today, 2), bestSentence: { level: 4 } });
    expect(model.items[M]?.card.reps).toBe(1);
  });
});

describe("transcript C: dialect is never corrected", () => {
  const d = new Driver([], plan());
  d.say(voice("I will do a discussion with my manager; we preponed it."), {
    reply: "Got it, you'll have a discussion. What's it about?",
    deferred_note: { said: "do a discussion", suggest: "have a discussion" },
  });
  d.say(voice("About my leave, I am out of station next week."), {
    reply: "That sounds like a nice break. Where are you going?",
    deferred_note: { said: "out of station", suggest: "out of town" },
  });
  const today = clockAt(d.t).day;
  const model = d.end();
  const summary = buildSummary(d.events, "s1", model, today);

  it("stays in CONVERSE with no target", () => {
    expect(typesOf(d)).toEqual(["CONVERSE", "CONVERSE", "CONVERSE"]);
  });

  it("keeps the real note and drops the one that 'corrects' Indian English", () => {
    expect(summary.polish).toEqual([{ said: "do a discussion", suggest: "have a discussion" }]);
  });

  it("offers the international forms as options in the recap, not as corrections", () => {
    expect(summary.alternatives).toEqual([
      { phrase: "prepone", international: "bring forward" },
      { phrase: "out of station", international: "out of town" },
    ]);
  });
});

describe("transcript D: forgotten word, cued recall", () => {
  const M = "meticulous_adj";
  const history = seededHistory(M);
  const before = replay(history).items[M]!;
  const d = new Driver(history, plan({ topic: "health_lifestyle", due: [M] }));
  d.say(voice("My sister works at a pharmacy."), {
    reply: "Your sister must check every prescription so carefully. What word describes a person like that?",
  });
  d.say(voice("I forgot."), { reply: "Here's a clue: it means very careful about every small detail." });
  d.say(voice("I forgot."), { reply: "It starts with 'me-ti'." });
  d.say(voice("Meticulous! My sister is meticulous about prescriptions."), {
    judgement: judged(true),
    reply: "Exactly. Is she like that at home too?",
  });
  const model = d.end();

  it("never skips a hint level (brief §6), even though research D jumps to the first sound", () => {
    expect(typesOf(d)).toEqual(["CONVERSE", "ELICIT", "HINT1", "HINT2", "JUDGE"]);
  });

  it("never says the word before the learner does", () => {
    for (const reply of d.replies.slice(1, 4)) expect(leaksTarget(reply, getItem(M)), reply).toBe(false);
  });

  it("logs cued recall: level 2 and Hard, without lowering the item's level", () => {
    const [a] = sessionAttempts(d);
    expect(a).toMatchObject({ hints: 2 });
    expect(outcomeOf(a!)).toEqual({ kind: "success", level: 2, rating: "Hard" });
    expect(model.items[M]?.level).toBe(before.level);
    expect(model.items[M]?.card.reps).toBe(before.card.reps + 1);
    expect(model.items[M]!.dueDay > before.dueDay).toBe(true);
  });
});

describe("UNCERTAIN: low ASR confidence on the target", () => {
  const B = "bottleneck_n";
  const history = seededHistory(B);
  const before = replay(history).items[B]!;
  const d = new Driver(history, plan({ topic: "city_transport", due: [B] }));
  d.say(voice("Traffic was terrible today."), { reply: "Where does the traffic always get stuck near you?" });
  d.say(voice("The bottleneck is near the flyover", 0.92, { bottleneck: 0.41 }), {
    reply: "Sorry, I may have misheard. Could you say that again?",
  });
  d.say(voice("The bottleneck is near the flyover", 0.92, { bottleneck: 0.47 }), { reply: "Thanks. Let's keep going." });
  const model = d.end();

  it("asks once to repeat, then moves on without judging", () => {
    expect(typesOf(d)).toEqual(["CONVERSE", "ELICIT", "CLARIFY", "CONVERSE"]);
  });

  it("changes neither the level nor the FSRS state", () => {
    expect(sessionAttempts(d)[0]).toMatchObject({ uncertain: true });
    expect(model.items[B]?.level).toBe(before.level);
    expect(model.items[B]?.card).toEqual(before.card);
    expect(model.items[B]?.dueDay).toBe(before.dueDay);
  });
});

describe("spontaneous use", () => {
  const G = "gruelling_adj";
  const S = "sedentary_adj";

  it("is evidence only (level 5, no FSRS change) when the item isn't due", () => {
    const history = seededHistory(G, 1);
    const before = replay(history).items[G]!;
    const d = new Driver(history, plan({ topic: "city_transport" }), "s1", undefined, "How was the trip home?");
    d.say(voice("It was a gruelling journey, two hours in the bus."), {
      spontaneous: [{ item_id: G, appropriate: true, confidence: 0.92 }],
      reply: "Two hours sounds exhausting. Do you read on the bus?",
    });
    const model = d.end();
    expect(outcomeOf(sessionAttempts(d)[0]!)).toMatchObject({ kind: "success", level: 5 });
    expect(model.items[G]).toMatchObject({ level: 5, hasL5: true });
    expect(model.items[G]?.card).toEqual(before.card);
  });

  it("is the day's scheduled outcome (Easy) when the item is due, and removes it from the queue", () => {
    const history = seededHistory(S);
    const before = replay(history).items[S]!;
    const d = new Driver(history, plan({ topic: "health_lifestyle", due: [S] }), "s1", undefined, "What do you do after work?");
    const next = d.say(voice("Mostly I sit, my job is very sedentary."), {
      spontaneous: [{ item_id: S, appropriate: true, confidence: 0.9 }],
      reply: "Do you get any exercise on weekends?",
    });
    const model = d.end();
    expect(next.type).toBe("CONVERSE"); // no ELICIT: it was already used today
    expect(model.items[S]?.card.reps).toBe(before.card.reps + 1);
    expect(model.items[S]?.card.stability).toBeGreaterThan(before.card.stability);
  });

  it("is ignored when the learner only echoes the agent", () => {
    const d = new Driver(seededHistory(G, 1), plan(), "s1", undefined, "Was it a gruelling day?");
    d.say(voice("Yes, gruelling."), { spontaneous: [{ item_id: G, appropriate: true, confidence: 0.9 }] });
    expect(sessionAttempts(d)).toHaveLength(0);
  });

  it("also accepts a learner who says 'I don't know' to an unrelated question", () => {
    const d = new Driver([], plan());
    expect(d.say(dontKnow()).type).toBe("CONVERSE");
  });
});
