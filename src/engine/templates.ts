import { DEFAULTS } from "../config/defaults";
import { capWords } from "./guards";
import type { LexItem } from "./lexicon";
import type { SessionSummary } from "./summary";
import { TOPIC_LABELS, type Day, type Directive, type Topic } from "./types";

export const EMPTY_TRANSCRIPT_REPLY = "Sorry, I didn't catch that.";

/** FNV-1a: a deterministic hash, so the engine never needs Math.random. */
export function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/** I15: hint 3 option order is fixed per session and item, so the target is not always first. */
export function hintOptions(item: LexItem, sid: string): [string, string] {
  return fnv1a(`${sid}:${item.id}`) % 2 === 0 ? [item.lemma, item.distractor] : [item.distractor, item.lemma];
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const weekday = (d: Day): string => WEEKDAYS[new Date(Date.parse(`${d}T00:00:00Z`)).getUTCDay()] ?? d;

const article = (word: string) => (/^[aeiou]/i.test(word) ? `an ${word}` : `a ${word}`);

function list(words: string[]): string {
  if (words.length <= 1) return words.join("");
  return `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

export function recapLine(s: SessionSummary): string {
  const parts = ["Well done today."];
  if (s.learned.length) parts.push(`You learned ${list(s.learned.map((x) => x.lemma))}.`);
  for (const h of s.hinted.slice(0, 2)) parts.push(`${h.lemma} needed a hint, so it comes back on ${weekday(h.nextDue)}.`);
  if (s.spontaneous.length) parts.push(`Big win: you used ${list(s.spontaneous.map((x) => x.lemma))} on your own.`);
  const polish = s.polish[0];
  if (polish) parts.push(`One phrase to polish: "${polish.suggest}".`);
  parts.push(`${s.dueTomorrow} ${s.dueTomorrow === 1 ? "word is" : "words are"} due tomorrow.`);
  return capWords(parts.join(" "), DEFAULTS.recapWordCap);
}

/** PLAN §2 templated fallbacks, built only from the lexicon. */
export function fallbackReply(
  d: Directive,
  ctx: { item: LexItem | null; topic: Topic; sid: string; summary?: SessionSummary },
): string {
  const it = ctx.item;
  switch (d.type) {
    case "SEED":
      if (!it) break;
      return `Here's a useful word: ${it.lemma}. It means ${it.definition_simple}. People say '${it.collocations[0]}'. Can you make your own sentence with it?`;
    case "ELICIT":
      if (!it) break;
      return `Think of ${article(it.pos)} that means '${it.definition_simple}'. Can you use it in a sentence about ${TOPIC_LABELS[ctx.topic]}?`;
    case "HINT": {
      if (!it) break;
      if (d.hint_level === 1) return `Here's a clue: it means '${it.definition_simple}'.`;
      if (d.hint_level === 2) return `It starts with '${it.hint_onset}'.`;
      const [a, b] = hintOptions(it, ctx.sid);
      return `Is it '${a}' or '${b}'?`;
    }
    case "REVEAL":
      if (!it) break;
      return `The word is ${it.lemma}: ${it.definition_simple}. For example, '${it.collocations[0]}'. Can you use it?`;
    case "CLARIFY":
      return "Sorry, I may have misheard. Could you say your sentence again?";
    case "JUDGE":
      return "Thanks. Let's keep going.";
    case "RECAP":
      if (ctx.summary) return recapLine(ctx.summary);
      return "Well done today. See you next time.";
    case "CONVERSE":
      break;
  }
  return "Tell me a bit more about that.";
}
