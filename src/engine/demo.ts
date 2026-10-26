import { DEFAULTS } from "../config/defaults";
import { addDays, dayOf } from "./days";
import type { AttemptEv, Day, Ev, ItemId, Profile, Topic } from "./types";

// Brief §9 demo history, as scripted events replayed through the engine (never hand-written state).
// Six items: three due now at levels 2, 3 and 4; two learning and not yet due (one due tomorrow);
// one a single success away from mastery, due now (D9).
export const DEMO_ITEMS = {
  nearMastery: "meticulous_adj",
  dueL2: "bottleneck_n",
  dueL3: "sedentary_adj",
  dueL4: "prioritise_v",
  learning: "sustainable_adj",
  dueTomorrow: "unwind_v",
} as const;

export function demoProfile(today: Day): Profile {
  return {
    name: "Asha",
    exam: "IELTS",
    level: "B1",
    interests: ["work_study", "city_transport", "health_lifestyle"],
    testDate: addDays(today, 30),
  };
}

type Step =
  | { seed: ItemId }
  | {
      item: ItemId;
      mode: AttemptEv["mode"];
      say: string;
      ok?: boolean; // judge verdict; omitted for fragments and abandoned attempts
      hints?: AttemptEv["hints"];
      repaired?: boolean;
      fragment?: boolean;
      abandoned?: boolean;
    };

export function demoEvents(now: number, tzOffsetMin: number): Ev[] {
  const today = dayOf(now, tzOffsetMin);
  // Local noon on a past day, so every event sits safely on its intended calendar date.
  const noon = (d: Day) => Date.parse(`${d}T12:00:00Z`) + tzOffsetMin * 60_000;

  const session = (n: number, dayOffset: number, topic: Topic, steps: Step[]): Ev[] => {
    const sid = `demo-${n}`;
    const t0 = noon(addDays(today, dayOffset));
    const at = (i: number) => {
      const t = t0 + i * 30_000;
      return { t, day: dayOf(t, tzOffsetMin) };
    };
    const budgetS = n === 1 ? DEFAULTS.firstSessionS : DEFAULTS.laterSessionS;
    const evs: Ev[] = [{ k: "session_start", key: `${sid}:0:0`, sid, ...at(0), topic, budgetS, plan: { due: [], seeds: [] } }];
    steps.forEach((st, i) => {
      const base = { key: `${sid}:${i + 1}:0`, sid, ...at(i + 1) };
      if ("seed" in st) {
        evs.push({ ...base, k: "seed", item: st.seed });
        return;
      }
      evs.push({
        ...base,
        k: "attempt",
        item: st.item,
        mode: st.mode,
        hints: st.hints ?? 0,
        revealed: false,
        repaired: st.repaired ?? false,
        fragment: st.fragment ?? false,
        targetUsed: !st.abandoned,
        uncertain: false,
        abandoned: st.abandoned ?? false,
        asrMin: 0.94,
        modality: "voice",
        judge: st.ok === undefined ? null : { appropriate: st.ok, confidence: 0.9, issue: st.ok ? "none" : "collocation" },
        utterance: st.say,
      });
    });
    evs.push({ k: "session_end", key: `${sid}:end`, sid, ...at(steps.length + 1) });
    return evs;
  };

  const { nearMastery: A, dueL2: B, dueL3: C, dueL4: D, learning: E, dueTomorrow: F } = DEMO_ITEMS;
  return [
    ...session(1, -9, "work_study", [
      { seed: A },
      { item: A, mode: "seed", say: "My manager is meticulous about every report.", ok: true, repaired: true },
    ]),
    ...session(2, -7, "health_lifestyle", [
      { item: A, mode: "elicit", say: "My sister is meticulous about checking prescriptions.", ok: true },
    ]),
    ...session(3, -5, "work_study", [
      { item: A, mode: "spontaneous", say: "I try to be meticulous when I fill in visa forms.", ok: true },
    ]),
    ...session(4, -4, "city_transport", [
      { seed: B },
      { item: B, mode: "seed", say: "The traffic is a bottleneck.", ok: false, repaired: true },
      { item: B, mode: "elicit", say: "The bottleneck is near the toll plaza.", ok: true, hints: 2 },
    ]),
    ...session(5, -3, "health_lifestyle", [
      { seed: C },
      { item: C, mode: "seed", say: "I don't know.", abandoned: true },
      { seed: D },
      { item: D, mode: "seed", say: "I prioritise my IELTS practice in the morning.", ok: true },
      { item: C, mode: "elicit", say: "Sedentary.", fragment: true },
      { item: D, mode: "elicit", say: "At work I prioritise urgent emails first.", ok: true },
    ]),
    ...session(6, -1, "work_study", [
      { seed: E },
      { item: E, mode: "seed", say: "Using a steel water bottle is a sustainable habit.", ok: true },
      { item: E, mode: "elicit", say: "Solar panels on the roof are a sustainable choice.", ok: true },
      { seed: F },
      { item: F, mode: "seed", say: "I unwind by listening to old Hindi songs.", ok: true, repaired: true },
    ]),
  ];
}
