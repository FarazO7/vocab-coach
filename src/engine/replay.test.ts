import { describe, expect, it } from "vitest";
import { addDays, dayOf } from "./days";
import { newCard, review } from "./fsrs";
import { closeSession, closeStaleSessions, dropFutureEvents, dueItems, orderEvents, replay } from "./replay";
import type { AttemptEv, Ev } from "./types";

const TZ = -330;
const DAY = 86_400_000;
const T = Date.parse("2026-10-26T10:00:00+05:30");
const D0 = dayOf(T, TZ);

/** Tiny event builder: one session per call, events 10 s apart. */
function session(sid: string, dayOffset: number, body: (b: Builder) => void, closed = true, hour = 10): Ev[] {
  const b = new Builder(sid, T + dayOffset * DAY + (hour - 10) * 3_600_000);
  b.push({ k: "session_start", topic: "work_study", budgetS: 600, plan: { due: [], seeds: [] } });
  body(b);
  if (closed) b.events.push({ k: "session_end", key: `${sid}:end`, sid, t: b.t + 10_000, day: dayOf(b.t + 10_000, TZ) });
  return b.events;
}
class Builder {
  events: Ev[] = [];
  n = 0;
  constructor(
    public sid: string,
    public t: number,
  ) {}
  push(body: object): void {
    this.t += 10_000;
    this.events.push({ ...body, key: `${this.sid}:${this.n++}:0`, sid: this.sid, t: this.t, day: dayOf(this.t, TZ) } as Ev);
  }
  seed(item: string): void {
    this.push({ k: "seed", item });
  }
  attempt(item: string, p: Partial<AttemptEv> = {}): void {
    this.push({
      k: "attempt",
      item,
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
      utterance: `sentence with ${item}`,
      ...p,
    });
  }
}

const M = "mitigate_v";

describe("seed-day scheduling (brief §5 FSRS, I3)", () => {
  it("uses the Stretch outcome when there is one", () => {
    const m = replay(session("s1", 0, (b) => (b.seed(M), b.attempt(M, { mode: "seed" }), b.attempt(M, { hints: 2 }))));
    expect(m.items[M]?.card.reps).toBe(1);
    expect(m.items[M]?.dueDay).toBe(addDays(D0, 2)); // Hard
    expect(m.items[M]?.level).toBe(4); // max(4, 2)
  });

  it("falls back to the seed-sentence outcome without a Stretch", () => {
    const m = replay(session("s1", 0, (b) => (b.seed(M), b.attempt(M, { mode: "seed" }))));
    expect(m.items[M]?.dueDay).toBe(addDays(D0, 3)); // Good
  });

  it("falls back to the seed sentence when the Stretch is UNCERTAIN", () => {
    const m = replay(session("s1", 0, (b) => (b.seed(M), b.attempt(M, { mode: "seed" }), b.attempt(M, { uncertain: true }))));
    expect(m.items[M]?.dueDay).toBe(addDays(D0, 3));
  });

  it("leaves the card new, and due, when neither outcome exists", () => {
    const m = replay(session("s1", 0, (b) => (b.seed(M), b.attempt(M, { mode: "seed", abandoned: true, targetUsed: false }))));
    expect(m.items[M]?.card.reps).toBe(0);
    expect(dueItems(m, addDays(D0, 1), T + DAY)).toEqual([M]);
  });
});

describe("one FSRS update per item per day", () => {
  const seeded = session("s1", -3, (b) => (b.seed(M), b.attempt(M, { mode: "seed" }))); // Good, due day 0

  it("only the first scheduled outcome counts; later ones that day are evidence", () => {
    const m = replay([...seeded, ...session("s2", 0, (b) => (b.attempt(M, { hints: 3 }), b.attempt(M, { mode: "spontaneous" })))]);
    const it = m.items[M];
    expect(it?.card.reps).toBe(2);
    expect(it?.card.lapses).toBe(1); // the Again
    expect(it?.level).toBe(5); // miss 4 → 3, then the spontaneous evidence lifts it (D4)
  });

  it("a second session the same day doesn't touch FSRS", () => {
    const first = replay([...seeded, ...session("s2", 0, (b) => b.attempt(M))]);
    const both = replay([...seeded, ...session("s2", 0, (b) => b.attempt(M)), ...session("s3", 0, (b) => b.attempt(M, { hints: 3 }), true, 15)]);
    expect(both.items[M]?.card).toEqual(first.items[M]?.card);
    expect(both.items[M]?.level).toBe(3);
  });

  it("counts spontaneous use of a due item as its scheduled outcome (Easy)", () => {
    const m = replay([...seeded, ...session("s2", 0, (b) => b.attempt(M, { mode: "spontaneous" }))]);
    const expected = review(review(newCard(seeded[1]!.t), seeded[2]!.t, "Good"), m.items[M]!.card.last_review!.getTime(), "Easy");
    expect(m.items[M]?.card).toEqual(expected);
  });

  it("keeps spontaneous use of an item that isn't due as evidence only", () => {
    const before = replay(seeded);
    const m = replay([...seeded, ...session("s2", -1, (b) => b.attempt(M, { mode: "spontaneous" }))]);
    expect(m.items[M]?.card).toEqual(before.items[M]?.card);
    expect(m.items[M]?.level).toBe(5);
  });

  it("never changes anything for UNCERTAIN", () => {
    const before = replay(seeded).items[M];
    const after = replay([...seeded, ...session("s2", 0, (b) => b.attempt(M, { uncertain: true }))]).items[M];
    expect({ ...after, lastTouchedDay: before?.lastTouchedDay }).toEqual(before);
  });
});

describe("due list (I4)", () => {
  it("is day-based: an evening review is due on the morning of its due date", () => {
    const evening = session("s1", -3, (b) => (b.seed(M), b.attempt(M, { mode: "seed" })), true, 21);
    const morning = T - 2 * 3_600_000; // 08:00 on day 0
    expect(dueItems(replay(evening), dayOf(morning, TZ), morning)).toEqual([M]);
  });

  it("orders by lowest retrievability, then lexicon order", () => {
    const evs = [
      ...session("s1", -10, (b) => (b.seed("gruelling_adj"), b.attempt("gruelling_adj", { mode: "seed", repaired: true }))),
      ...session("s2", -3, (b) => (b.seed("meticulous_adj"), b.attempt("meticulous_adj", { mode: "seed" }), b.seed(M), b.attempt(M, { mode: "seed" }))),
    ];
    expect(dueItems(replay(evs), D0, T)).toEqual(["gruelling_adj", "meticulous_adj", M]);
  });
});

describe("mastery (brief §5, pinned)", () => {
  const history = (lastDay: number) => [
    ...session("s1", 0, (b) => (b.seed(M), b.attempt(M, { mode: "seed" }))),
    ...session("s2", 3, (b) => b.attempt(M)),
    ...session("s3", 4, (b) => b.attempt(M, { mode: "spontaneous" })),
    ...session("s4", lastDay, (b) => b.attempt(M, { fragment: true })),
  ];
  it("is not reached on day 6", () => {
    expect(replay(history(6)).items[M]?.mastered).toBe(false);
  });
  it("lands on day 7", () => {
    const it = replay(history(7)).items[M];
    expect(it?.mastered).toBe(true);
    expect(it?.masteredDay).toBe(addDays(D0, 7));
  });
  it("needs a level-5 event", () => {
    const evs = [
      ...session("s1", 0, (b) => (b.seed(M), b.attempt(M, { mode: "seed" }))),
      ...session("s2", 3, (b) => b.attempt(M)),
      ...session("s4", 8, (b) => b.attempt(M)),
    ];
    expect(replay(evs).items[M]?.mastered).toBe(false);
  });
  it("tracks 'used on your own' and 'still used after 7 days' (D10)", () => {
    const it = replay(history(7)).items[M];
    expect(it?.hasL5).toBe(true);
    expect(it?.usedLater).toBe(true);
    expect(replay(history(6)).items[M]?.usedLater).toBe(false);
  });
});

describe("event log", () => {
  const log = [
    ...session("s1", -9, (b) => (b.seed(M), b.attempt(M, { mode: "seed", repaired: true }), b.seed("hectic_adj"), b.attempt("hectic_adj", { mode: "seed" }))),
    ...session("s2", -6, (b) => (b.attempt(M, { hints: 1 }), b.attempt("hectic_adj", { hints: 3 }))),
    ...session("s3", -2, (b) => (b.attempt(M, { mode: "spontaneous" }), b.attempt("hectic_adj", { uncertain: true }))),
    ...session("s4", 0, (b) => b.attempt(M)),
  ];

  it("rebuilds the same model from a shuffled log with duplicates", () => {
    const shuffled = [...log].reverse().concat(log.slice(0, 5));
    expect(replay(shuffled)).toEqual(replay(log));
  });

  it("rebuilds the same model from a JSON round trip of the log (what localStorage holds)", () => {
    expect(replay(JSON.parse(JSON.stringify(log)) as Ev[])).toEqual(replay(log));
  });

  it("ignores open sessions until they are finalised", () => {
    const open = session("s5", 0, (b) => b.attempt("hectic_adj"), false);
    expect(replay([...log, ...open]).items).toEqual(replay(log).items);
    const end = closeSession([...log, ...open], "s5");
    expect(end).not.toBeNull();
    expect(replay([...log, ...open, end!]).items["hectic_adj"]).not.toEqual(replay(log).items["hectic_adj"]);
  });

  it("finalises idempotently and closes stale sessions with their last event's time", () => {
    const open = session("s5", 0, (b) => b.attempt("hectic_adj"), false);
    const all = [...log, ...open];
    const [stale] = closeStaleSessions(all);
    expect(stale?.t).toBe(open[open.length - 1]?.t);
    expect(closeSession([...all, stale!], "s5")).toBeNull();
    expect(closeStaleSessions(all, "s5")).toEqual([]);
  });

  it("drops future-dated events when the demo clock resets (I13)", () => {
    const future = session("s9", 3, (b) => b.attempt(M));
    const kept = dropFutureEvents([...log, ...future], T + 3_600_000);
    expect(orderEvents(kept)).toEqual(orderEvents(log));
  });
});
