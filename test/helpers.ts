import { dayOf } from "../src/engine/days";
import { getItem } from "../src/engine/lexicon";
import { tokensFromText } from "../src/engine/matcher";
import type { Plan } from "../src/engine/planner";
import { replay, closeSession, type Model } from "../src/engine/replay";
import { apply, played, startSession, step, type SessionState } from "../src/engine/session";
import type { AttemptEv, Clock, Directive, Ev, Judgement, LearnerTurn, TurnResult } from "../src/engine/types";

export const TZ = -330; // IST
export const DAY = 86_400_000;
export const T0 = Date.parse("2026-10-26T10:00:00+05:30");
export const clockAt = (t: number): Clock => ({ t, day: dayOf(t, TZ) });

export function voice(text: string, conf = 0.95, perWord: Record<string, number> = {}): LearnerTurn {
  const tokens = tokensFromText(text).map((t) => ({ w: t.w, conf: perWord[t.w] ?? conf }));
  return { tokens, text, modality: "voice" };
}
export const typed = (text: string): LearnerTurn => ({ tokens: tokensFromText(text), text, modality: "text" });
export const dontKnow = (): LearnerTurn => ({ ...voice("I don't know"), button: "dont_know" });

export const judged = (appropriate: boolean, confidence = 0.9, issue?: Judgement["issue"]): Judgement => ({
  appropriate,
  confidence,
  issue: issue ?? (appropriate ? "none" : "collocation"),
});

export function result(p: Partial<TurnResult> = {}): TurnResult {
  return { reply: "OK.", judgement: null, spontaneous: [], deferred_note: null, learner_state: "ok", ...p };
}

export const plan = (p: Partial<Plan> = {}): Plan => ({
  topic: "work_study",
  budgetS: 600,
  due: [],
  dueTotal: 0,
  seeds: [],
  probe: null,
  ...p,
});

export const attempts = (events: Ev[]): AttemptEv[] => events.flatMap((e) => (e.k === "attempt" ? [e] : []));

/** Drives one session the way the UI will: step, mocked LLM result, apply, record what was played. */
export class Driver {
  state: SessionState;
  events: Ev[];
  model: Model;
  t: number;
  directives: Directive[] = [];
  replies: string[] = [];

  constructor(history: Ev[], p: Plan, sid = "s1", t = T0, opening = "Hello! How was your day?") {
    this.events = [...history];
    this.model = replay(this.events);
    this.t = t;
    const s = startSession(p, sid, clockAt(t));
    this.events.push(...s.events);
    this.directives.push(s.directive);
    this.state = played(s.state, opening);
    this.replies.push(opening);
  }

  /** Learner turn after `afterS` seconds. `res` is the mocked LLM output for the directive this turn produces. */
  say(turn: LearnerTurn, res: Partial<TurnResult> = {}, afterS = 30): Directive {
    this.t += afterS * 1000;
    const clock = clockAt(this.t);
    const out = step(this.state, turn, this.model, clock);
    this.events.push(...out.events);
    this.directives.push(out.directive);
    const r = result(res);
    const applied = apply(out.state, r, clock);
    this.events.push(...applied.events);
    this.state = played(applied.state, r.reply);
    this.replies.push(r.reply);
    return out.directive;
  }

  end(): Model {
    const close = closeSession(this.events, this.state.sid, clockAt(this.t));
    if (close) this.events.push(close);
    this.model = replay(this.events);
    return this.model;
  }
}

/** A closed session `daysAgo` days back that seeded `id` with a good seed sentence (Good: due 3 days later). */
export function seededHistory(id: string, daysAgo = 3, sid = "past"): Ev[] {
  const d = new Driver([], plan({ seeds: [id] }), sid, T0 - daysAgo * DAY);
  d.say(voice("I like planning things carefully."));
  d.say(voice(`I think ${getItem(id).lemma} fits my life well.`), { judgement: judged(true) });
  d.end();
  return d.events;
}
