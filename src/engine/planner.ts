import { DEFAULTS } from "../config/defaults";
import { diffDays } from "./days";
import { confusable, getItem, isItemId, LEXICON, lexiconIndex, type LexItem } from "./lexicon";
import { dueItems, type Model } from "./replay";
import { CEFR, TOPICS, type Day, type ItemId, type LearnerLevel, type Profile, type Topic } from "./types";

export interface Plan {
  topic: Topic;
  budgetS: number;
  due: ItemId[]; // items to elicit, in order (due items, then any day-7 probe)
  dueTotal: number;
  seeds: ItemId[];
  probe: ItemId | null;
}

/**
 * Should-have day-7 probe (I24): an unannounced ELICIT on an item first met 7+ days ago that isn't due and
 * hasn't yet been used after day 7. It is not due, so replay keeps its outcome as evidence only (no FSRS update),
 * and a success feeds "still used after 7 days".
 */
export function pickProbe(model: Model, today: Day, exclude: ItemId[]): ItemId | null {
  const candidates = Object.values(model.items)
    .filter((it) => isItemId(it.id) && !exclude.includes(it.id) && !it.usedLater && it.lastTouchedDay !== today)
    .filter((it) => diffDays(it.seededDay, today) >= DEFAULTS.masteryMinDays)
    .sort((a, b) => (a.seededDay < b.seededDay ? -1 : a.seededDay > b.seededDay ? 1 : lexiconIndex(a.id) - lexiconIndex(b.id)));
  return candidates[0]?.id ?? null;
}

const rank = (c: (typeof CEFR)[number]) => CEFR.indexOf(c);
const learnerRank = (l: LearnerLevel) => rank(l === "not_sure" ? "B1" : l);

/** Brief §5 seed priority (research weights, a hypothesis). New items: R = 0, errors = 0, goal = 1. */
export function seedPriority(item: LexItem, profile: Profile, topic: Topic): number {
  const r = 0;
  const errors = 0;
  const goal = 1;
  const usefulness = (3 - item.freq_band) / 2;
  const interest = item.topics.some((t) => t === topic || profile.interests.includes(t)) ? 1 : 0;
  const gap = Math.min(Math.abs(rank(item.cefr_est) - learnerRank(profile.level)) / 3, 1);
  return 0.35 * (1 - r) + 0.2 * goal + 0.15 * usefulness + 0.1 * interest + 0.15 * errors - 0.15 * gap;
}

/** I9: rotate through chosen interests by session count, or all topics if none were chosen. */
export function sessionTopic(profile: Profile, sessionNumber: number): Topic {
  const pool: readonly Topic[] = profile.interests.length > 0 ? profile.interests : TOPICS;
  return pool[sessionNumber % pool.length] ?? "work_study";
}

export function planSession(args: { model: Model; profile: Profile; today: Day; now: number; practise?: ItemId }): Plan {
  const { model, profile, today, now, practise } = args;
  const n = model.closedSessions;
  const topic = sessionTopic(profile, n);
  const dueAll = dueItems(model, today, now);
  // I16: Practise now puts the item first; replay decides whether its outcome is scheduled.
  const ordered = practise ? [practise, ...dueAll.filter((id) => id !== practise)] : dueAll;
  const scheduled = ordered.slice(0, DEFAULTS.maxDuePerSession);
  const probe = scheduled.length < DEFAULTS.maxDuePerSession ? pickProbe(model, today, dueAll) : null;
  const due = probe ? [...scheduled, probe] : scheduled;

  const seeds: ItemId[] = [];
  if (dueAll.length <= DEFAULTS.noSeedsWhenDueOver) {
    const touchedToday = Object.values(model.items)
      .filter((it) => it.lastTouchedDay === today)
      .map((it) => it.id);
    const blockers = [...new Set([...touchedToday, ...due])].map(getItem);
    const max = n === 0 ? DEFAULTS.seedsFirstSession : DEFAULTS.seedsLater;
    const candidates = LEXICON.filter((i) => !model.items[i.id])
      .map((i) => ({ i, p: seedPriority(i, profile, topic) }))
      .sort((a, b) => b.p - a.p || lexiconIndex(a.i.id) - lexiconIndex(b.i.id));
    for (const { i } of candidates) {
      if (seeds.length >= max) break;
      if ([...blockers, ...seeds.map(getItem)].some((b) => confusable(i, b))) continue;
      seeds.push(i.id);
    }
  }

  return {
    topic,
    budgetS: n === 0 ? DEFAULTS.firstSessionS : DEFAULTS.laterSessionS,
    due,
    dueTotal: dueAll.length,
    seeds,
    probe,
  };
}
