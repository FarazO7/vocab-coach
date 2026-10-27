import { DEFAULTS } from "../config/defaults";
import type { AllowEntry, LexItem } from "./lexicon";
import { matchesAnyForm, matchItem, tokensFromText } from "./matcher";
import type { Token } from "./types";

export const wordCount = (s: string): number => s.trim().split(/\s+/).filter(Boolean).length;

/** Brief §6 guard: keep whole sentences up to the cap; if the first sentence alone is too long, cut it at a word. */
export function capWords(text: string, cap: number): string {
  const clean = text.trim();
  if (wordCount(clean) <= cap) return clean;
  const sentences = clean.match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g) ?? [clean];
  let out = "";
  for (const s of sentences) {
    if (wordCount(out + s) > cap) break;
    out += s;
  }
  if (out.trim()) return out.trim();
  return `${clean.split(/\s+/).slice(0, cap).join(" ").replace(/[,;:.!?]+$/, "")}.`;
}

/**
 * Brief §6 leak guard for ELICIT, HINT 1, HINT 2 and CLARIFY: any form or spelling variant,
 * plus (D7) any token sharing the first 5 letters of a single-word lemma of 6+ letters.
 */
export function leaksTarget(text: string, item: LexItem): boolean {
  const tokens = tokensFromText(text);
  if (matchItem(tokens, item)) return true;
  if (item.lemma.includes(" ")) return false;
  const stems = [item.lemma, ...item.spelling_variants]
    .map((w) => w.toLowerCase().replace(/[^a-z]/g, ""))
    .filter((w) => w.length >= DEFAULTS.leakStemMinLemma)
    .map((w) => w.slice(0, DEFAULTS.leakStemLetters));
  return tokens.some((t) => stems.some((stem) => t.w.replace(/[^a-z]/g, "").startsWith(stem)));
}

/** Copy rule: no em or en dashes in anything the learner reads or hears (I18). */
export function fixDashes(text: string): string {
  return text
    .replace(/(\d)\s*[\u2013\u2014]\s*(\d)/g, "$1 to $2")
    .replace(/\s*[\u2013\u2014]+\s*/g, ", ")
    .replace(/,\s*([,.!?])/g, "$1")
    .replace(/^,\s*|,\s*$/g, "")
    .trim();
}

/**
 * Replies are captions and speech, never rendered Markdown: the model sometimes adds **bold** or `code`,
 * which would show as raw symbols and could be read aloud (found in the M5 run).
 */
export function stripMarkdown(text: string): string {
  return text
    .replace(/(\*\*|__)(.+?)\1/g, "$2")
    .replace(/(^|[\s(“"'])[*_]([^*_\n]+?)[*_](?=[\s).,!?;:”"']|$)/g, "$1$2")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/^[ \t]*(?:#{1,6}[ \t]+|[-*•][ \t]+)/gm, "")
    .replace(/[*`]{2,}/g, "")
    .trim();
}

/** Every reply and note goes through this before any other guard. */
export const cleanText = (text: string): string => stripMarkdown(fixDashes(text));

export function allowlistHits(tokens: Token[], list: readonly AllowEntry[]): AllowEntry[] {
  return list.filter((e) => matchesAnyForm(tokens, e.forms));
}

/** I17: a deferred note that "corrects" an allowlisted Indian English form is dropped. */
export const keepNote = (note: { said: string }, list: readonly AllowEntry[]): boolean =>
  allowlistHits(tokensFromText(note.said), list).length === 0;
