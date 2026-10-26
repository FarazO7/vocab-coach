import { DEFAULTS } from "../config/defaults";
import { addDays } from "./days";
import { ALLOWLIST, getItem, isItemId } from "./lexicon";
import { outcomeOf } from "./outcome";
import type { Model } from "./replay";
import type { Day, Ev, ItemId } from "./types";

export interface SessionSummary {
  learned: { item: ItemId; lemma: string; level: number }[];
  hinted: { item: ItemId; lemma: string; nextDue: Day }[];
  spontaneous: { item: ItemId; lemma: string }[];
  polish: { said: string; suggest: string }[];
  alternatives: { phrase: string; international: string }[];
  uncertain: { item: ItemId; lemma: string }[];
  dueTomorrow: number;
}

const uniq = <T>(xs: T[]) => [...new Set(xs)];

/** SESSION_SUMMARY for RECAP and the recap screen. Built from a finalised session and the replayed model. */
export function buildSummary(events: Ev[], sid: string, model: Model, today: Day): SessionSummary {
  const evs = events.filter((e) => e.sid === sid);
  const lemma = (id: ItemId) => getItem(id).lemma;
  const attempts = evs.filter((e) => e.k === "attempt" && isItemId(e.item)).flatMap((e) => (e.k === "attempt" ? [e] : []));

  const learned = uniq(evs.flatMap((e) => (e.k === "seed" && isItemId(e.item) ? [e.item] : []))).map((item) => ({
    item,
    lemma: lemma(item),
    level: model.items[item]?.level ?? 0,
  }));
  const hinted = uniq(attempts.filter((a) => a.mode === "elicit" && (a.hints > 0 || a.revealed)).map((a) => a.item)).map(
    (item) => ({ item, lemma: lemma(item), nextDue: model.items[item]?.dueDay ?? today }),
  );
  const spontaneous = uniq(
    attempts.filter((a) => a.mode === "spontaneous" && outcomeOf(a).kind === "success").map((a) => a.item),
  ).map((item) => ({ item, lemma: lemma(item) }));
  const uncertain = uniq(attempts.filter((a) => a.uncertain).map((a) => a.item)).map((item) => ({ item, lemma: lemma(item) }));
  const polish = evs
    .flatMap((e) => (e.k === "note" ? [{ said: e.said, suggest: e.suggest }] : []))
    .slice(0, DEFAULTS.deferredNotesPerSession);
  const alternatives = uniq(evs.flatMap((e) => (e.k === "dialect" ? [e.entry] : []))).flatMap((id) => {
    const entry = ALLOWLIST.find((a) => a.id === id);
    return entry?.international ? [{ phrase: entry.phrase, international: entry.international }] : [];
  });
  const tomorrow = addDays(today, 1);
  const dueTomorrow = Object.values(model.items).filter((it) => it.dueDay <= tomorrow).length;

  return { learned, hinted, spontaneous, polish, alternatives, uncertain, dueTomorrow };
}
