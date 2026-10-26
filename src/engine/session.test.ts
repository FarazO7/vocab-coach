import { describe, expect, it } from "vitest";
import { attempts, clockAt, dontKnow, Driver, judged, plan, seededHistory, T0, typed, voice } from "../../test/helpers";
import { DEFAULTS } from "../config/defaults";
import { leaksTarget } from "./guards";
import { getItem } from "./lexicon";
import { outcomeOf } from "./outcome";
import { replay } from "./replay";
import { requestEnd, targetChip } from "./session";
import { fallbackReply } from "./templates";

const M = "meticulous_adj";

describe("hint ladder (brief §5, DoD 2)", () => {
  it("steps through hints 1, 2 and 3, then REVEAL, and never shows the word early", () => {
    const d = new Driver(seededHistory(M), plan({ due: [M] }));
    const item = getItem(M);
    const seen: string[] = [];
    const chips: string[] = [];
    const turn = () => {
      chips.push(JSON.stringify(targetChip(d.state, d.model, clockAt(d.t).day)));
    };
    d.say(voice("Work was busy today."), { reply: "Who at work is careful with every small detail?" });
    turn();
    for (let i = 0; i < 4; i++) {
      const dir = d.directives[d.directives.length - 1]!;
      seen.push(`${dir.type}${dir.hint_level || ""}`);
      const line = fallbackReply(dir, { item, topic: "work_study", sid: "s1" });
      if (dir.type !== "HINT" || dir.hint_level < 3) expect(leaksTarget(line, item), line).toBe(false);
      d.say(dontKnow(), { reply: line });
      turn();
    }
    seen.push(d.directives[d.directives.length - 1]!.type);
    expect(seen).toEqual(["ELICIT", "HINT1", "HINT2", "HINT3", "REVEAL"]);
    const before = chips.slice(0, 3).join(" ");
    expect(before).not.toContain("meticulous");
    expect(chips[2]).toContain("me-ti");
    expect(chips[3]).toContain("meticulous"); // hint 3 shows both options
    expect(chips[4]).toBe(JSON.stringify({ kind: "word", text: "meticulous" }));
  });

  it("logs a miss when the learner still can't use it after REVEAL (I7)", () => {
    const d = new Driver(seededHistory(M), plan({ due: [M] }));
    d.say(voice("Busy day."));
    for (let i = 0; i < 4; i++) d.say(dontKnow());
    d.say(voice("Sorry, no."));
    const [a] = attempts(d.events.filter((e) => e.sid === "s1"));
    expect(a).toMatchObject({ revealed: true, hints: 3, targetUsed: false });
    expect(outcomeOf(a!).kind).toBe("miss");
  });

  it("counts picking the word at hint 3 as a miss", () => {
    const d = new Driver(seededHistory(M), plan({ due: [M] }));
    d.say(voice("Busy day."));
    for (let i = 0; i < 3; i++) d.say(dontKnow());
    expect(d.say(voice("Meticulous"), { judgement: judged(true) })).toMatchObject({ type: "JUDGE", repair_allowed: false });
    expect(outcomeOf(attempts(d.events.filter((e) => e.sid === "s1"))[0]!).kind).toBe("miss");
  });
});

describe("ASR confidence (brief §5, DoD 4, I5)", () => {
  it("CLARIFYs once, then marks UNCERTAIN with no level or FSRS change", () => {
    const history = seededHistory(M);
    const d = new Driver(history, plan({ due: [M] }));
    d.say(voice("Busy day."));
    expect(d.say(voice("My boss is meticulous", 0.95, { meticulous: 0.4 }))).toMatchObject({ type: "CLARIFY", item_id: M });
    expect(d.say(voice("My boss is meticulous", 0.95, { meticulous: 0.5 })).type).not.toBe("JUDGE");
    expect(attempts(d.events.filter((e) => e.sid === "s1"))[0]).toMatchObject({ uncertain: true });
    const model = d.end();
    const before = replay(history).items[M];
    expect({ ...model.items[M], lastTouchedDay: before?.lastTouchedDay }).toEqual(before);
  });

  it("marks UNCERTAIN when the word disappears after a CLARIFY", () => {
    const d = new Driver(seededHistory(M), plan({ due: [M] }));
    d.say(voice("Busy day."));
    d.say(voice("My boss is meticulous", 0.95, { meticulous: 0.3 }));
    d.say(voice("My boss is very careful"));
    expect(attempts(d.events.filter((e) => e.sid === "s1"))[0]).toMatchObject({ uncertain: true, targetUsed: false });
  });

  it("never CLARIFYs typed input", () => {
    const d = new Driver(seededHistory(M), plan({ due: [M] }));
    d.say(voice("Busy day."));
    expect(d.say(typed("My boss is meticulous about deadlines")).type).toBe("JUDGE");
  });
});

describe("judging (brief §5 rule 2)", () => {
  const due = () => new Driver(seededHistory(M), plan({ due: [M] }));

  it("allows one self-repair, then credits the repaired sentence as 4 Hard", () => {
    const d = due();
    d.say(voice("Busy day."));
    expect(d.say(voice("My boss meticulous the files"), { judgement: judged(false) })).toMatchObject({ type: "JUDGE", repair_allowed: true });
    expect(d.say(voice("My boss is meticulous about files"), { judgement: judged(true) })).toMatchObject({ type: "JUDGE", repair_allowed: false });
    const [a] = attempts(d.events.filter((e) => e.sid === "s1"));
    expect(outcomeOf(a!)).toEqual({ kind: "success", level: 4, rating: "Hard" });
  });

  it("logs a miss when the repair is still wrong", () => {
    const d = due();
    d.say(voice("Busy day."));
    d.say(voice("My boss meticulous the files"), { judgement: judged(false) });
    d.say(voice("My boss meticulous files"), { judgement: judged(false) });
    expect(outcomeOf(attempts(d.events.filter((e) => e.sid === "s1"))[0]!).kind).toBe("miss");
  });

  it("logs a miss when the repair drops the word (I6)", () => {
    const d = due();
    d.say(voice("Busy day."));
    d.say(voice("My boss meticulous the files"), { judgement: judged(false) });
    expect(d.say(voice("My boss is careful"))).toMatchObject({ type: "JUDGE", repair_allowed: false });
    expect(outcomeOf(attempts(d.events.filter((e) => e.sid === "s1"))[0]!).kind).toBe("miss");
  });

  it("treats low judge confidence, or no judgement, as UNCERTAIN", () => {
    const d = due();
    d.say(voice("Busy day."));
    d.say(voice("My boss is meticulous about files"), { judgement: judged(true, 0.5) });
    expect(attempts(d.events.filter((e) => e.sid === "s1"))[0]).toMatchObject({ uncertain: true });

    const e = due();
    e.say(voice("Busy day."));
    e.say(voice("My boss is meticulous about files"), { judgement: null });
    expect(attempts(e.events.filter((x) => x.sid === "s1"))[0]).toMatchObject({ uncertain: true });
  });

  it("credits a fragment as free recall without a repair prompt (D2)", () => {
    const d = due();
    d.say(voice("Busy day."));
    expect(d.say(voice("Um, meticulous"), { judgement: judged(false, 0.9, "mention_not_use") })).toMatchObject({
      type: "JUDGE",
      repair_allowed: false,
    });
    expect(outcomeOf(attempts(d.events.filter((e) => e.sid === "s1"))[0]!)).toEqual({ kind: "success", level: 3, rating: "Good" });
  });
});

describe("seeding (brief §5, D1, D3)", () => {
  it("re-invites once after a SEED, then stops with no outcome", () => {
    const d = new Driver([], plan({ seeds: [M] }));
    expect(d.say(voice("I work in an office.")).type).toBe("SEED");
    expect(d.say(dontKnow())).toMatchObject({ type: "REVEAL", item_id: M });
    expect(d.say(voice("No, sorry")).type).toBe("CONVERSE");
    expect(attempts(d.events)[0]).toMatchObject({ abandoned: true, mode: "seed" });
  });

  it("credits a sentence after the re-invite as the seed sentence", () => {
    const d = new Driver([], plan({ seeds: [M] }));
    d.say(voice("I work in an office."));
    d.say(dontKnow());
    d.say(voice("My mother is meticulous about cooking"), { judgement: judged(true) });
    expect(outcomeOf(attempts(d.events)[0]!)).toEqual({ kind: "success", level: 4, rating: "Good" });
  });

  it("keeps at least 2 learner turns between seeds", () => {
    const d = new Driver([], plan({ seeds: [M, "procrastinate_v"] }));
    expect(d.say(voice("Hi there.")).type).toBe("SEED");
    expect(d.say(voice("My boss is meticulous about plans"), { judgement: judged(true) }).type).toBe("JUDGE");
    expect(d.say(voice("Yes, true.")).type).toBe("SEED");
  });

  it("plants no new seed in the last 150 s (D1)", () => {
    const d = new Driver([], plan({ seeds: [M], budgetS: 360 }));
    expect(d.say(voice("Hello."), {}, 360 - DEFAULTS.noSeedInLastS + 1).type).toBe("CONVERSE");
  });
});

describe("Stretch window (I1)", () => {
  const seeded = () => {
    const d = new Driver([], plan({ seeds: [M] }));
    d.say(voice("Hello."), {}, 10); // SEED at t = 10 s, learner turn 1
    d.say(voice("My boss is meticulous about plans"), { judgement: judged(true) }, 10);
    return d;
  };

  it("stays closed before 120 s even after 2 learner turns", () => {
    const d = seeded();
    expect(d.say(voice("Nice."), {}, 30).type).toBe("CONVERSE"); // 50 s, 2 turns
  });

  it("opens at 120 s once 2 learner turns have passed", () => {
    const d = seeded();
    expect(d.say(voice("Nice."), {}, 110)).toMatchObject({ type: "ELICIT", item_id: M }); // 130 s, 2 turns
  });

  it("is forced at 240 s even with fewer turns", () => {
    const d = new Driver([], plan({ seeds: [M] }));
    d.say(voice("Hello."), {}, 10);
    d.say(dontKnow(), {}, 10);
    d.say(voice("Not sure"), {}, 10); // abandoned at 30 s; 2 learner turns since the seed
    const e = new Driver([], plan({ seeds: [M] }));
    e.say(voice("Hello."), {}, 10);
    e.say(voice("My boss is meticulous about plans"), { judgement: judged(true) }, 245); // turn 2 at 255 s: still awaiting? no, judged
    expect(e.say(voice("Okay."), {}, 1)).toMatchObject({ type: "ELICIT", item_id: M });
    expect(d.state.seeded).toHaveLength(1);
  });
});

describe("session budget (brief §5, I2)", () => {
  it("recaps once the budget is reached and nothing is awaited", () => {
    const d = new Driver([], plan({ budgetS: 360 }));
    expect(d.say(voice("Hello."), {}, 361).type).toBe("RECAP");
  });

  it("lets an open ladder finish past the budget", () => {
    const d = new Driver(seededHistory(M), plan({ due: [M], budgetS: 360 }));
    d.say(voice("Hello."), {}, 350);
    expect(d.say(dontKnow(), {}, 20)).toMatchObject({ type: "HINT", hint_level: 1 });
  });

  it("abandons an open await at the 10-minute hard cap", () => {
    const d = new Driver(seededHistory(M), plan({ due: [M] }));
    d.say(voice("Hello."), {}, 590);
    expect(d.say(dontKnow(), {}, 15).type).toBe("RECAP");
    expect(attempts(d.events.filter((e) => e.sid === "s1"))[0]).toMatchObject({ abandoned: true });
  });

  it("recaps on 'let's stop here' and on the End button", () => {
    const d = new Driver([], plan());
    expect(d.say(voice("Let's stop here.")).type).toBe("RECAP");
    const e = new Driver(seededHistory(M), plan({ due: [M] }));
    e.say(voice("Hello."));
    const out = requestEnd(e.state, clockAt(e.t));
    expect(out.directive.type).toBe("RECAP");
    expect(out.events).toHaveLength(1);
  });
});

describe("learner state (I11)", () => {
  it("switches to CONVERSE only after frustration and abandons the await", () => {
    const d = new Driver(seededHistory(M), plan({ due: [M], seeds: ["procrastinate_v"] }));
    d.say(voice("Hello."));
    d.say(voice("This is too hard, I hate this"), { learner_state: "frustrated" });
    expect(attempts(d.events.filter((e) => e.sid === "s1"))[0]).toMatchObject({ abandoned: true });
    expect(d.say(voice("Okay.")).type).toBe("CONVERSE");
    expect(d.say(voice("Fine.")).type).toBe("CONVERSE");
  });

  it("recaps on the turn after wants_to_end", () => {
    const d = new Driver([], plan());
    d.say(voice("I need to go soon."), { learner_state: "wants_to_end" });
    expect(d.say(voice("Yes.")).type).toBe("RECAP");
  });
});

describe("spontaneous use candidates (D5)", () => {
  it("offers a learned word the learner used unprompted, and logs it", () => {
    const d = new Driver(seededHistory(M), plan());
    d.say(voice("Hello."), { reply: "How was your weekend?" });
    d.say(voice("My sister is meticulous about her garden"), {
      spontaneous: [{ item_id: M, appropriate: true, confidence: 0.9 }],
    });
    const a = attempts(d.events.filter((e) => e.sid === "s1"));
    expect(a).toHaveLength(1);
    expect(outcomeOf(a[0]!)).toMatchObject({ kind: "success", level: 5 });
  });

  it("excludes echoes of the last 2 agent turns, low ASR confidence and unknown ids", () => {
    const d = new Driver(seededHistory(M), plan(), "s1", T0, "Are you meticulous about planning?");
    d.say(voice("Yes I am meticulous"), { spontaneous: [{ item_id: M, appropriate: true, confidence: 0.9 }] });
    d.say(voice("My team is meticulous", 0.95, { meticulous: 0.4 }), { spontaneous: [{ item_id: M, appropriate: true, confidence: 0.9 }] });
    d.say(voice("Nice day"), { spontaneous: [{ item_id: "hectic_adj", appropriate: true, confidence: 0.9 }] });
    expect(attempts(d.events.filter((e) => e.sid === "s1"))).toHaveLength(0);
  });

  it("excludes this session's seeds until their Stretch", () => {
    const d = new Driver([], plan({ seeds: [M] }));
    d.say(voice("Hi."));
    d.say(voice("My boss is meticulous"), { judgement: judged(true) });
    d.say(voice("Fine."), { reply: "Tell me about your weekend." });
    d.say(voice("I am meticulous at home too"), { spontaneous: [{ item_id: M, appropriate: true, confidence: 0.9 }] });
    expect(attempts(d.events).filter((a) => a.mode === "spontaneous")).toHaveLength(0);
  });

  it("removes a due item from the queue when it's used spontaneously", () => {
    const d = new Driver(seededHistory(M), plan({ due: [M] }), "s1", T0, "How was your day?");
    // Not elicited in the same turn (the verdict isn't known yet), nor later (it was used appropriately).
    expect(d.say(voice("My boss is meticulous"), { spontaneous: [{ item_id: M, appropriate: true, confidence: 0.9 }] }).type).toBe("CONVERSE");
    expect(d.say(voice("Yes, very.")).type).toBe("CONVERSE");
    expect(d.state.dueDone).toEqual([M]);
  });

  it("still elicits a due item on the next turn if the spontaneous use wasn't appropriate", () => {
    const d = new Driver(seededHistory(M), plan({ due: [M] }), "s1", T0, "How was your day?");
    d.say(voice("My boss is meticulous the files"), { spontaneous: [{ item_id: M, appropriate: false, confidence: 0.9 }] });
    expect(d.say(voice("Yes.")).type).toBe("ELICIT");
  });
});

describe("notes and dialect (I17, D8)", () => {
  it("keeps at most 2 deferred notes and drops allowlist 'corrections'", () => {
    const d = new Driver([], plan());
    d.say(voice("We preponed it."), { deferred_note: { said: "we preponed it", suggest: "we brought it forward" } });
    d.say(voice("I did a discussion."), { deferred_note: { said: "did a discussion", suggest: "had a discussion" } });
    d.say(voice("One and half hour."), { deferred_note: { said: "one and half hour", suggest: "an hour and a half" } });
    d.say(voice("Very much tired."), { deferred_note: { said: "very much tired", suggest: "very tired" } });
    expect(d.events.filter((e) => e.k === "note").map((e) => (e.k === "note" ? e.said : ""))).toEqual([
      "did a discussion",
      "one and half hour",
    ]);
    expect(d.events.filter((e) => e.k === "dialect")).toHaveLength(1);
  });

  it("gives every event a unique key", () => {
    const d = new Driver(seededHistory(M), plan({ due: [M], seeds: ["procrastinate_v"] }));
    d.say(voice("We preponed it."));
    for (let i = 0; i < 4; i++) d.say(dontKnow());
    d.say(voice("My boss is meticulous"), { judgement: judged(true) });
    d.end();
    const keys = d.events.map((e) => e.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
