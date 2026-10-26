import { describe, expect, it } from "vitest";
import { addDays, dayOf } from "./days";
import { DEMO_ITEMS, demoEvents, demoProfile } from "./demo";
import { retrievability } from "./fsrs";
import { getItem } from "./lexicon";
import { planSession } from "./planner";
import { dueItems, replay } from "./replay";
import type { Ev } from "./types";

const { nearMastery, dueL2, dueL3, dueL4, learning, dueTomorrow } = DEMO_ITEMS;

// Late at night, early morning and midday, in IST, UTC and a US time zone (Date#getTimezoneOffset sign).
const cases = [
  ["IST midday", Date.parse("2026-10-27T12:00:00+05:30"), -330],
  ["IST just after midnight", Date.parse("2026-10-27T00:20:00+05:30"), -330],
  ["UTC late evening", Date.parse("2026-10-27T23:40:00Z"), 0],
  ["US Eastern morning", Date.parse("2026-10-27T07:00:00-04:00"), 240],
] as const;

describe.each(cases)("demo history (brief §9, D9): %s", (_, now, tz) => {
  const today = dayOf(now, tz);
  const events = demoEvents(now, tz);
  const model = replay(events);

  it("is built only from closed, past-dated sessions", () => {
    expect(model.closedSessions).toBe(6);
    expect(events.every((e) => e.t < now)).toBe(true);
    expect(Object.keys(model.items).sort()).toEqual(Object.values(DEMO_ITEMS).sort());
  });

  it("has three items due now at different levels, plus the near-mastery item", () => {
    const due = dueItems(model, today, now);
    expect([...due].sort()).toEqual([nearMastery, dueL2, dueL3, dueL4].sort());
    expect([dueL2, dueL3, dueL4].map((id) => model.items[id]?.level)).toEqual([2, 3, 4]);
    // Lowest retrievability first. The near-mastery item's R sits close to two others, so its slot
    // (second to fourth) depends on the time of day; all four fit in a 10-minute session.
    const r = due.map((id) => retrievability(model.items[id]!.card, now));
    expect(r).toEqual([...r].sort((a, b) => a - b));
  });

  it("has two learning items not yet due; one comes due tomorrow, both by +3 days", () => {
    const due = (d: number) => dueItems(model, addDays(today, d), now + d * 86_400_000);
    expect(due(0)).not.toContain(learning);
    expect(due(0)).not.toContain(dueTomorrow);
    expect(due(1)).toContain(dueTomorrow);
    expect(due(1)).not.toContain(learning);
    expect(due(3)).toEqual(expect.arrayContaining([learning, dueTomorrow]));
  });

  it("is one success away from mastery on the near-mastery item", () => {
    expect(model.items[nearMastery]?.mastered).toBe(false);
    const sid = "today";
    const t = now - 60_000;
    const day = dayOf(t, tz);
    const success: Ev[] = [
      { k: "session_start", key: `${sid}:0:0`, sid, t, day, topic: "work_study", budgetS: 600, plan: { due: [], seeds: [] } },
      {
        k: "attempt",
        key: `${sid}:1:0`,
        sid,
        t: t + 1,
        day,
        item: nearMastery,
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
        utterance: `${getItem(nearMastery).lemma} again`,
      },
      { k: "session_end", key: `${sid}:end`, sid, t: t + 2, day },
    ];
    expect(replay([...events, ...success]).items[nearMastery]?.mastered).toBe(true);
  });

  it("plans a 10-minute session with the four due items first", () => {
    const p = planSession({ model, profile: demoProfile(today), today, now });
    expect(p.budgetS).toBe(600);
    expect(p.due).toHaveLength(4);
    expect(p.seeds.length).toBeGreaterThan(0);
  });
});
