import { DEFAULTS } from "../config/defaults";
import { addDays, diffDays } from "./days";
import { newCard, retrievability, review, type Card } from "./fsrs";
import { lexiconIndex } from "./lexicon";
import { nextLevel, outcomeOf, type Outcome } from "./outcome";
import type { AttemptEv, Clock, Day, Ev, ItemId, Topic } from "./types";

export interface ItemState {
  id: ItemId;
  level: number;
  card: Card;
  dueDay: Day;
  seededDay: Day; // first exposure
  lastReviewDay: Day | null; // last day FSRS was updated
  lastTouchedDay: Day;
  l4Days: Day[]; // calendar days with a success at level 4 or above
  hasL5: boolean;
  lastSuccessDay: Day | null;
  usedLater: boolean; // D10 "still used after 7 days"
  mastered: boolean;
  masteredDay: Day | null;
  bestSentence: { text: string; level: number } | null;
  misses: number;
}

export interface SessionInfo {
  sid: string;
  topic: Topic | null;
  startT: number;
  startDay: Day;
  closed: boolean;
}

export interface Model {
  items: Record<ItemId, ItemState>;
  sessions: SessionInfo[];
  closedSessions: number;
}

function keyParts(key: string): [number, number] {
  const [, turn, n] = key.split(":");
  if (turn === "end") return [Number.MAX_SAFE_INTEGER, 0];
  return [Number(turn), Number(n)];
}

/** Sort by time, then by key within a turn; drop duplicate keys. Same set of events in, same order out. */
export function orderEvents(events: Ev[]): Ev[] {
  const sorted = [...events].sort((a, b) => {
    if (a.t !== b.t) return a.t - b.t;
    if (a.sid !== b.sid) return a.sid < b.sid ? -1 : 1;
    const [ta, na] = keyParts(a.key);
    const [tb, nb] = keyParts(b.key);
    return ta - tb || na - nb;
  });
  const seen = new Set<string>();
  return sorted.filter((e) => (seen.has(e.key) ? false : (seen.add(e.key), true)));
}

function fresh(id: ItemId, t: number, day: Day): ItemState {
  return {
    id,
    level: 0,
    card: newCard(t),
    dueDay: day,
    seededDay: day,
    lastReviewDay: null,
    lastTouchedDay: day,
    l4Days: [],
    hasL5: false,
    lastSuccessDay: null,
    usedLater: false,
    mastered: false,
    masteredDay: null,
    bestSentence: null,
    misses: 0,
  };
}

/** D4: every non-UNCERTAIN outcome moves the ladder and counts as evidence for mastery. */
function applyEvidence(it: ItemState, a: AttemptEv, o: Outcome): void {
  it.lastTouchedDay = a.day;
  it.level = nextLevel(it.level, o);
  if (o.kind === "miss") it.misses += 1;
  if (o.kind !== "success" || o.level === null) return;
  if (o.level >= 4 && !it.l4Days.includes(a.day)) it.l4Days.push(a.day);
  if (o.level === 5) it.hasL5 = true;
  it.lastSuccessDay = a.day;
  const age = diffDays(it.seededDay, a.day);
  if (o.level >= 3 && age >= DEFAULTS.masteryMinDays) it.usedLater = true;
  if (!it.bestSentence || o.level >= it.bestSentence.level) it.bestSentence = { text: a.utterance, level: o.level };
  // Brief §5 Mastery: level 4+ on two calendar days, a level-5 event, last success 7+ days after first exposure.
  if (!it.mastered && it.l4Days.length >= 2 && it.hasL5 && age >= DEFAULTS.masteryMinDays) {
    it.mastered = true;
    it.masteredDay = a.day;
  }
}

/** One closed session: ladder in time order, then at most one FSRS review per item (brief §5 FSRS, I3, I4). */
function applySession(items: Record<ItemId, ItemState>, evs: Ev[]): void {
  const seededHere = new Set<ItemId>();
  const seedSentence = new Map<ItemId, AttemptEv>();
  const stretch = new Map<ItemId, AttemptEv>();
  const due = new Map<ItemId, AttemptEv>();

  for (const e of evs) {
    if (e.k === "seed") {
      if (!items[e.item]) {
        items[e.item] = fresh(e.item, e.t, e.day);
        seededHere.add(e.item);
      }
      continue;
    }
    if (e.k !== "attempt") continue;
    const it = items[e.item];
    if (!it) continue;
    const o = outcomeOf(e);
    // Scheduling eligibility is judged on the state before this session's review.
    if (o.rating !== null) {
      if (seededHere.has(e.item)) {
        if (e.mode === "seed" && !seedSentence.has(e.item)) seedSentence.set(e.item, e);
        if (e.mode === "elicit" && !stretch.has(e.item)) stretch.set(e.item, e);
      } else if (it.dueDay <= e.day && it.lastReviewDay !== e.day && !due.has(e.item)) {
        due.set(e.item, e);
      }
    }
    applyEvidence(it, e, o);
  }

  const scheduled = new Map(due);
  for (const id of seededHere) {
    const pick = stretch.get(id) ?? seedSentence.get(id);
    if (pick) scheduled.set(id, pick);
  }
  for (const [id, a] of scheduled) {
    const it = items[id];
    const rating = outcomeOf(a).rating;
    if (!it || rating === null) continue;
    it.card = review(it.card, a.t, rating);
    it.lastReviewDay = a.day;
    it.dueDay = addDays(a.day, it.card.scheduled_days);
  }
}

/** The learner model is a pure function of the event log. Open sessions are not applied until finalised. */
export function replay(input: Ev[]): Model {
  const events = orderEvents(input);
  const bySid = new Map<string, Ev[]>();
  for (const e of events) {
    const list = bySid.get(e.sid);
    if (list) list.push(e);
    else bySid.set(e.sid, [e]);
  }
  const items: Record<ItemId, ItemState> = {};
  const sessions: SessionInfo[] = [];
  for (const [sid, evs] of bySid) {
    const first = evs[0];
    if (!first) continue;
    const start = evs.find((e) => e.k === "session_start");
    const closed = evs.some((e) => e.k === "session_end");
    sessions.push({
      sid,
      topic: start?.k === "session_start" ? start.topic : null,
      startT: first.t,
      startDay: first.day,
      closed,
    });
    if (closed) applySession(items, evs);
  }
  return { items, sessions, closedSessions: sessions.filter((s) => s.closed).length };
}

/** I4: due when the local calendar date of the due date is today or earlier; lowest R first, then lexicon order. */
export function dueItems(model: Model, today: Day, now: number): ItemId[] {
  return Object.values(model.items)
    .filter((it) => it.dueDay <= today && it.lastReviewDay !== today)
    .map((it) => ({ id: it.id, r: retrievability(it.card, now) }))
    .sort((a, b) => a.r - b.r || lexiconIndex(a.id) - lexiconIndex(b.id))
    .map((x) => x.id);
}

/** Finalise: the session_end event to append, or null if the session is already closed (idempotent). */
export function closeSession(events: Ev[], sid: string, at?: Clock): Ev | null {
  const evs = events.filter((e) => e.sid === sid);
  if (evs.length === 0 || evs.some((e) => e.k === "session_end")) return null;
  const last = evs.reduce((a, b) => (b.t > a.t ? b : a));
  const when = at ?? { t: last.t, day: last.day };
  return { k: "session_end", key: `${sid}:end`, sid, t: when.t, day: when.day };
}

/** On load: close any session a closed tab left open, stamped with its last event's time. */
export function closeStaleSessions(events: Ev[], activeSid: string | null = null): Ev[] {
  const sids = [...new Set(events.map((e) => e.sid))].filter((sid) => sid !== activeSid);
  return sids.flatMap((sid) => {
    const end = closeSession(events, sid);
    return end ? [end] : [];
  });
}

/** I13: resetting the demo clock drops events dated after real time; replay rebuilds the rest. */
export const dropFutureEvents = (events: Ev[], realNow: number): Ev[] => events.filter((e) => e.t <= realNow);
