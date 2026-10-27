import { DEFAULTS } from "../config/defaults";
import { allowlistHits, keepNote } from "./guards";
import { detectIntent } from "./intent";
import { ALLOWLIST, getItem, isItemId } from "./lexicon";
import { matchItem, tokensFromText } from "./matcher";
import type { Plan } from "./planner";
import type { Model } from "./replay";
import { hintOptions } from "./templates";
import type { AttemptEv, Clock, Day, Directive, DirectiveType, Ev, ItemId, LearnerTurn, Topic, TurnResult } from "./types";

export interface Await {
  item: ItemId;
  mode: "seed" | "elicit";
  hints: 0 | 1 | 2 | 3;
  revealed: boolean;
  reinvited: boolean; // D3: one re-invite after a SEED
  repairPrompted: boolean;
  clarified: boolean;
}

interface PendingJudge {
  item: ItemId;
  fragment: boolean;
  targetUsed: boolean;
  utterance: string;
  asrMin: number;
  modality: "voice" | "text";
}

interface Candidate {
  item: ItemId;
  asrMin: number;
}

export interface SessionState {
  sid: string;
  startT: number;
  budgetS: number;
  topic: Topic;
  plan: { due: ItemId[]; seeds: ItemId[] };
  learnerTurns: number;
  agentTurns: string[]; // as actually played
  seeded: { item: ItemId; t: number; turn: number }[];
  stretched: ItemId[];
  dueDone: ItemId[];
  dialectSeen: string[];
  await: Await | null;
  judge: PendingJudge | null;
  candidates: Candidate[];
  lastTurn: { text: string; modality: "voice" | "text" } | null;
  frustrated: boolean;
  wantsEnd: boolean;
  ended: boolean;
  notes: number;
  seq: number;
}

export interface StepOut {
  state: SessionState;
  directive: Directive;
  candidates: ItemId[]; // spontaneous-use candidates for the LLM to judge
  events: Ev[];
}

const FILLERS = new Set(["um", "uh", "er", "erm", "hmm", "ah"]);

const dir = (type: DirectiveType, item: ItemId | null = null, hint: 0 | 1 | 2 | 3 = 0, repair = false): Directive => ({
  type,
  item_id: item,
  hint_level: hint,
  repair_allowed: repair,
});

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type EvBody = DistributiveOmit<Ev, "key" | "sid" | "t" | "day">;

function emit(s: SessionState, clock: Clock, body: EvBody): Ev {
  const key = `${s.sid}:${s.learnerTurns}:${s.seq}`;
  s.seq += 1;
  return { ...body, key, sid: s.sid, t: clock.t, day: clock.day } as Ev;
}

function attemptEv(
  s: SessionState,
  clock: Clock,
  a: Await,
  f: Pick<AttemptEv, "utterance" | "asrMin" | "modality" | "judge" | "fragment" | "targetUsed"> &
    Partial<Pick<AttemptEv, "uncertain" | "abandoned">>,
): Ev {
  return emit(s, clock, {
    k: "attempt",
    item: a.item,
    mode: a.mode,
    hints: a.hints,
    revealed: a.revealed,
    repaired: a.repairPrompted,
    uncertain: false,
    abandoned: false,
    ...f,
  });
}

const newAwait = (item: ItemId, mode: Await["mode"]): Await => ({
  item,
  mode,
  hints: 0,
  revealed: false,
  reinvited: false,
  repairPrompted: false,
  clarified: false,
});

function finish(s: SessionState, a: Await): void {
  s.await = null;
  if (a.mode !== "elicit") return;
  if (s.seeded.some((x) => x.item === a.item)) s.stretched.push(a.item);
  if (s.plan.due.includes(a.item) && !s.dueDone.includes(a.item)) s.dueDone.push(a.item);
}

function abandon(s: SessionState, clock: Clock, events: Ev[]): void {
  const a = s.await;
  if (!a) return;
  const turn = s.lastTurn;
  events.push(
    attemptEv(s, clock, a, {
      utterance: turn?.text ?? "",
      asrMin: 0,
      modality: turn?.modality ?? "text",
      judge: null,
      fragment: false,
      targetUsed: false,
      abandoned: true,
    }),
  );
  finish(s, a);
}

/** D5: items the learner may have used on their own this turn. */
function spontaneousCandidates(s: SessionState, turn: LearnerTurn, model: Model): Candidate[] {
  const eligible = new Set([...Object.keys(model.items), ...s.stretched]);
  if (s.await) eligible.delete(s.await.item);
  const recent = s.agentTurns.slice(-DEFAULTS.echoAgentTurns).map(tokensFromText);
  const out: Candidate[] = [];
  for (const id of eligible) {
    if (!isItemId(id)) continue;
    const item = getItem(id);
    const m = matchItem(turn.tokens, item);
    if (!m || (turn.modality === "voice" && m.minConf < DEFAULTS.asrConfFloor)) continue;
    if (recent.some((t) => matchItem(t, item))) continue;
    out.push({ item: id, asrMin: m.minConf });
  }
  return out;
}

function stretchOpen(x: SessionState["seeded"][number], s: SessionState, clock: Clock): boolean {
  const since = (clock.t - x.t) / 1000;
  const turns = s.learnerTurns - x.turn;
  // I1: open at 120 s and 2 learner turns, or at 240 s, whichever comes first.
  return since >= DEFAULTS.stretchForceS || (since >= DEFAULTS.stretchMinS && turns >= DEFAULTS.stretchMinLearnerTurns);
}

function recap(s: SessionState): Directive {
  s.ended = true;
  return dir("RECAP");
}

/** Brief §5 rule 1, "not awaiting an item". */
function next(s: SessionState, clock: Clock, events: Ev[]): Directive {
  const elapsed = (clock.t - s.startT) / 1000;
  if (elapsed >= s.budgetS) return recap(s);
  if (s.frustrated) return dir("CONVERSE");

  const stretch = s.seeded.find((x) => !s.stretched.includes(x.item) && stretchOpen(x, s, clock));
  if (stretch) {
    s.await = newAwait(stretch.item, "elicit");
    return dir("ELICIT", stretch.item);
  }
  // A due item the learner just used is waiting on the LLM's spontaneous-use verdict; don't elicit it in the same turn.
  const due = s.plan.due.find((id) => !s.dueDone.includes(id) && !s.candidates.some((c) => c.item === id));
  if (due) {
    s.await = newAwait(due, "elicit");
    return dir("ELICIT", due);
  }
  const seed = s.plan.seeds.find((id) => !s.seeded.some((x) => x.item === id));
  const lastSeed = s.seeded[s.seeded.length - 1];
  const turnsOk = !lastSeed || s.learnerTurns - lastSeed.turn >= DEFAULTS.seedMinLearnerTurnsApart;
  if (seed && turnsOk && s.budgetS - elapsed >= DEFAULTS.noSeedInLastS) {
    s.seeded.push({ item: seed, t: clock.t, turn: s.learnerTurns });
    events.push(emit(s, clock, { k: "seed", item: seed }));
    s.await = newAwait(seed, "seed");
    return dir("SEED", seed);
  }
  return dir("CONVERSE");
}

/** Brief §5 rule 2, "awaiting item X". Returns null when the await resolved and rule 1 should pick the next move. */
function onAwait(s: SessionState, a: Await, turn: LearnerTurn, clock: Clock, events: Ev[]): Directive | null {
  const item = getItem(a.item);
  const m = matchItem(turn.tokens, item);
  const base = { utterance: turn.text, modality: turn.modality, judge: null, fragment: false };

  if (m && turn.modality === "voice" && m.minConf < DEFAULTS.asrConfFloor) {
    if (!a.clarified) {
      a.clarified = true;
      return dir("CLARIFY", a.item, a.hints);
    }
    events.push(attemptEv(s, clock, a, { ...base, asrMin: m.minConf, targetUsed: true, uncertain: true }));
    finish(s, a);
    return null;
  }

  if (!m) {
    if (a.clarified) {
      // I5: we can't tell whether the first hearing was real.
      events.push(attemptEv(s, clock, a, { ...base, asrMin: 0, targetUsed: false, uncertain: true }));
      finish(s, a);
      return null;
    }
    if (a.repairPrompted) {
      // I6: no word in the repair attempt counts as "not appropriate after a repair".
      s.judge = { item: a.item, fragment: false, targetUsed: false, utterance: turn.text, asrMin: 0, modality: turn.modality };
      return dir("JUDGE", a.item, a.hints, false);
    }
    if (a.mode === "seed") {
      // D3: no hints after a SEED; one re-invite, then stop with no outcome.
      if (!a.reinvited) {
        a.reinvited = true;
        return dir("REVEAL", a.item);
      }
      events.push(attemptEv(s, clock, a, { ...base, asrMin: 0, targetUsed: false, abandoned: true }));
      finish(s, a);
      return null;
    }
    if (a.revealed) {
      // I7: not used after the reveal; still a miss.
      events.push(attemptEv(s, clock, a, { ...base, asrMin: 0, targetUsed: false }));
      finish(s, a);
      return null;
    }
    if (a.hints < DEFAULTS.hintsBeforeReveal) {
      a.hints = (a.hints + 1) as 1 | 2 | 3;
      return dir("HINT", a.item, a.hints);
    }
    a.revealed = true;
    return dir("REVEAL", a.item, a.hints);
  }

  const content = turn.tokens.filter((t) => !FILLERS.has(t.w)).length;
  const fragment = a.mode === "elicit" && content <= DEFAULTS.fragmentMaxTokens; // D2
  const missAlready = a.mode === "elicit" && (a.revealed || a.hints >= DEFAULTS.hintsBeforeReveal);
  s.judge = { item: a.item, fragment, targetUsed: true, utterance: turn.text, asrMin: m.minConf, modality: turn.modality };
  return dir("JUDGE", a.item, a.hints, !a.repairPrompted && !fragment && !missAlready);
}

export function startSession(plan: Plan, sid: string, clock: Clock): { state: SessionState; directive: Directive; events: Ev[] } {
  const state: SessionState = {
    sid,
    startT: clock.t,
    budgetS: plan.budgetS,
    topic: plan.topic,
    plan: { due: plan.due, seeds: plan.seeds },
    learnerTurns: 0,
    agentTurns: [],
    seeded: [],
    stretched: [],
    dueDone: [],
    dialectSeen: [],
    await: null,
    judge: null,
    candidates: [],
    lastTurn: null,
    frustrated: false,
    wantsEnd: false,
    ended: false,
    notes: 0,
    seq: 0,
  };
  const start = emit(state, clock, {
    k: "session_start",
    topic: plan.topic,
    budgetS: plan.budgetS,
    plan: { due: plan.due, seeds: plan.seeds },
  });
  // I10: the agent opens with CONVERSE before any learner turn.
  return { state, directive: dir("CONVERSE"), events: [start] };
}

/** One learner turn in; the directive for the agent's reply out. Pure: returns a new state. */
export function step(prev: SessionState, turn: LearnerTurn, model: Model, clock: Clock): StepOut {
  const s = structuredClone(prev);
  s.learnerTurns += 1;
  s.seq = 0;
  s.judge = null;
  s.lastTurn = { text: turn.text, modality: turn.modality };
  const events: Ev[] = [];

  for (const e of allowlistHits(turn.tokens, ALLOWLIST)) {
    if (s.dialectSeen.includes(e.id)) continue;
    s.dialectSeen.push(e.id);
    events.push(emit(s, clock, { k: "dialect", entry: e.id }));
  }

  const elapsed = (clock.t - s.startT) / 1000;
  if (elapsed >= DEFAULTS.hardCapS || s.wantsEnd || detectIntent(turn.text, turn.button) === "end") {
    abandon(s, clock, events); // I2 hard cap, I11 wants_to_end
    s.candidates = [];
    return { state: s, directive: recap(s), candidates: [], events };
  }

  s.candidates = spontaneousCandidates(s, turn, model);
  const a = s.await;
  const fromAwait = a ? onAwait(s, a, turn, clock, events) : null;
  const directive = fromAwait ?? next(s, clock, events);
  return { state: s, directive, candidates: s.candidates.map((c) => c.item), events };
}

/** The End button: not a learner turn (I14); abandons any open await and asks for the recap. */
export function requestEnd(prev: SessionState, clock: Clock): StepOut {
  const s = structuredClone(prev);
  const events: Ev[] = [];
  abandon(s, clock, events);
  s.judge = null;
  s.candidates = [];
  return { state: s, directive: recap(s), candidates: [], events };
}

/** Fold the LLM's TurnResult (or null when the templated fallback was used) into the session. */
export function apply(prev: SessionState, result: TurnResult | null, clock: Clock): { state: SessionState; events: Ev[] } {
  const s = structuredClone(prev);
  const events: Ev[] = [];
  const p = s.judge;
  const a = s.await;

  if (p && a && p.item === a.item) {
    const j = result?.judgement ?? null;
    const f = { utterance: p.utterance, asrMin: p.asrMin, modality: p.modality, judge: j, fragment: p.fragment, targetUsed: p.targetUsed };
    const verdictSkipped = p.fragment || !p.targetUsed || a.revealed || a.hints >= DEFAULTS.hintsBeforeReveal;
    if (verdictSkipped) {
      events.push(attemptEv(s, clock, a, f));
      finish(s, a);
    } else if (!j || j.confidence < DEFAULTS.judgeConfFloor) {
      events.push(attemptEv(s, clock, a, { ...f, uncertain: true }));
      finish(s, a);
    } else if (j.appropriate || a.repairPrompted) {
      events.push(attemptEv(s, clock, a, f));
      finish(s, a);
    } else {
      a.repairPrompted = true; // one self-repair; keep awaiting
    }
  }

  const turn = s.lastTurn;
  const seen = new Set<ItemId>();
  for (const r of result?.spontaneous ?? []) {
    const c = s.candidates.find((x) => x.item === r.item_id);
    if (!c || !turn || seen.has(c.item) || r.confidence < DEFAULTS.judgeConfFloor) continue;
    seen.add(c.item);
    events.push(
      emit(s, clock, {
        k: "attempt",
        item: c.item,
        mode: "spontaneous",
        hints: 0,
        revealed: false,
        repaired: false,
        fragment: false,
        targetUsed: true,
        uncertain: false,
        abandoned: false,
        asrMin: c.asrMin,
        modality: turn.modality,
        judge: { appropriate: r.appropriate, confidence: r.confidence, issue: "none" },
        utterance: turn.text,
      }),
    );
    // Spontaneous use of a due item is its scheduled outcome and removes it from today's queue.
    if (r.appropriate && s.plan.due.includes(c.item) && !s.dueDone.includes(c.item)) s.dueDone.push(c.item);
  }

  const note = result?.deferred_note;
  if (note && s.notes < DEFAULTS.deferredNotesPerSession && keepNote(note, ALLOWLIST)) {
    events.push(emit(s, clock, { k: "note", said: note.said, suggest: note.suggest }));
    s.notes += 1;
  }

  if (result?.learner_state === "frustrated" && !s.frustrated) {
    s.frustrated = true;
    abandon(s, clock, events); // I11
  }
  if (result?.learner_state === "wants_to_end") s.wantsEnd = true;

  s.judge = null;
  s.candidates = [];
  return { state: s, events };
}

/** "Report a wrong correction" (brief §10): stored in the local event log and included in the export. */
export function reportCaption(prev: SessionState, caption: string, clock: Clock): { state: SessionState; events: Ev[] } {
  const s = structuredClone(prev);
  return { state: s, events: [emit(s, clock, { k: "report", caption: caption.slice(0, 600) })] };
}

/** Record the agent turn as actually played (barge-in truncates it). */
export function played(prev: SessionState, text: string): SessionState {
  const s = structuredClone(prev);
  s.agentTurns = [...s.agentTurns, text].slice(-DEFAULTS.historyTurns);
  return s;
}

export type Chip =
  | { kind: "none" }
  | { kind: "word"; text: string }
  | { kind: "clue"; pos: string; learnt: Day | null; onset: string | null }
  | { kind: "options"; options: [string, string] };

/** Brief §8 target chip. The word only shows during SEED, at hint 3 (as one of two options) and after REVEAL. */
export function targetChip(s: SessionState, model: Model, today: Day): Chip {
  const a = s.await;
  if (!a) return { kind: "none" };
  const item = getItem(a.item);
  if (a.mode === "seed" || a.revealed) return { kind: "word", text: item.lemma };
  if (a.hints >= 3) return { kind: "options", options: hintOptions(item, s.sid) };
  const learnt = model.items[a.item]?.seededDay ?? (s.seeded.some((x) => x.item === a.item) ? today : null);
  return { kind: "clue", pos: item.pos, learnt, onset: a.hints >= 2 ? item.hint_onset : null };
}
