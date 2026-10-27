import { DEFAULTS } from "../config/defaults";
import { capWords, cleanText, keepNote, leaksTarget, wordCount } from "../engine/guards";
import { ALLOWLIST, getItem, type LexItem } from "../engine/lexicon";
import { fallbackReply } from "../engine/templates";
import type { Directive, TurnResult } from "../engine/types";
import { buildInput, SYSTEM_PROMPT, toSessionSummary } from "./prompt";
import { addUsage, ZERO_USAGE, type LlmCall, type Usage } from "./providers/llm";
import { TurnResultSchema, type TurnRequest } from "./schemas";

export interface TurnResponse {
  result: TurnResult;
  guards: string[]; // codes only, e.g. llm_timeout, leak, over_cap, cut, template
  usage: Usage;
  calls: number;
  llmMs: number;
  fallback: boolean;
}

/** Brief §6: the target must not be said in ELICIT, HINT 1, HINT 2 or CLARIFY. */
const leakGuarded = (d: Directive) => d.type === "ELICIT" || d.type === "CLARIFY" || (d.type === "HINT" && d.hint_level < 3);

function sanitise(r: TurnResult, req: TurnRequest): TurnResult {
  const allowed = new Set(req.candidateIds);
  const seen = new Set<string>();
  const note = r.deferred_note;
  return {
    reply: cleanText(r.reply),
    judgement: req.directive.type === "JUDGE" ? r.judgement : null,
    spontaneous: r.spontaneous.filter((s) => allowed.has(s.item_id) && !seen.has(s.item_id) && Boolean(seen.add(s.item_id))),
    deferred_note: note && keepNote(note, ALLOWLIST) ? { said: cleanText(note.said), suggest: cleanText(note.suggest) } : null,
    learner_state: r.learner_state,
  };
}

function template(req: TurnRequest, sid: string, item: LexItem | null): TurnResult {
  const summary = req.summary ? toSessionSummary(req.summary) : undefined;
  return {
    reply: fallbackReply(req.directive, { item, topic: req.topic, sid, summary }),
    judgement: null, // a JUDGE without a judgement is UNCERTAIN in the engine
    spontaneous: [],
    deferred_note: null,
    learner_state: "ok",
  };
}

/**
 * At most 2 LLM calls whatever the reason (D6). A failed, malformed or leaking reply is never used;
 * an over-cap reply is regenerated once and, if the retry is no better, cut at a sentence boundary.
 */
export async function runTurn(req: TurnRequest, sid: string, llm: LlmCall, clock: () => number = () => performance.now()): Promise<TurnResponse> {
  const started = clock();
  const input = buildInput(req, sid);
  const item = req.directive.item_id ? getItem(req.directive.item_id) : null;
  const cap = req.directive.type === "RECAP" ? DEFAULTS.recapWordCap : DEFAULTS.replyWordCap;
  const guards: string[] = [];
  let usage = ZERO_USAGE;
  let calls = 0;
  let overCap: TurnResult | null = null;

  const done = (result: TurnResult, fallback: boolean): TurnResponse => ({
    result,
    guards,
    usage,
    calls,
    llmMs: Math.round(clock() - started),
    fallback,
  });

  while (calls < DEFAULTS.maxLlmCallsPerTurn) {
    calls += 1;
    const out = await llm({ instructions: SYSTEM_PROMPT, input });
    usage = addUsage(usage, out.usage);
    if (!out.ok) {
      guards.push(`llm_${out.code}`);
      continue;
    }
    const checked = TurnResultSchema.safeParse(out.value);
    if (!checked.success) {
      guards.push("llm_schema");
      continue;
    }
    const result = sanitise(checked.data, req);
    if (item && leakGuarded(req.directive) && leaksTarget(result.reply, item)) {
      guards.push("leak");
      continue;
    }
    if (wordCount(result.reply) > cap) {
      guards.push("over_cap");
      overCap = result;
      continue;
    }
    return done(result, false);
  }

  if (overCap) {
    guards.push("cut");
    return done({ ...overCap, reply: capWords(overCap.reply, cap) }, false);
  }
  guards.push("template");
  return done(template(req, sid, item), true);
}
