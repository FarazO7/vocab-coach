import type { LexItem } from "./lexicon";
import type { Token } from "./types";

const SEPARABLE_GAP = 3;

/** Lowercase, straighten apostrophes, split on spaces and hyphens, trim punctuation. */
export function normalise(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .split(/[\s\-‐-―]+/)
    .map((w) => w.replace(/^[^a-z0-9']+|[^a-z0-9']+$/g, "").replace(/^'+|'+$/g, ""))
    .filter(Boolean);
}

/** STT words keep their confidence; a hyphenated word becomes several tokens with the same confidence. */
export function tokensFromWords(words: { w: string; conf: number }[]): Token[] {
  return words.flatMap(({ w, conf }) => normalise(w).map((t) => ({ w: t, conf })));
}

/** Typed input has confidence 1.0 (brief §5 Matcher). */
export function tokensFromText(text: string): Token[] {
  return normalise(text).map((w) => ({ w, conf: 1 }));
}

export interface Match {
  start: number;
  end: number; // exclusive; for a separable match this spans the gap tokens too
  minConf: number; // lowest confidence among the item's own tokens
}

function at(tokens: Token[], i: number, words: string[]): boolean {
  return words.every((w, j) => tokens[i + j]?.w === w);
}

function minConf(tokens: Token[], idx: number[]): number {
  return Math.min(...idx.map((i) => tokens[i]?.conf ?? 0));
}

export function matchPhrase(tokens: Token[], phrase: string, separable: boolean): Match[] {
  const words = normalise(phrase);
  const out: Match[] = [];
  if (words.length === 0) return out;
  const verb = separable && words.length > 1 ? words.slice(0, -1) : words;
  const particle = separable && words.length > 1 ? words[words.length - 1] : undefined;
  for (let i = 0; i + verb.length <= tokens.length; i++) {
    if (!at(tokens, i, verb)) continue;
    const verbIdx = verb.map((_, j) => i + j);
    if (particle === undefined) {
      out.push({ start: i, end: i + verb.length, minConf: minConf(tokens, verbIdx) });
      continue;
    }
    const first = i + verb.length;
    for (let k = first; k <= first + SEPARABLE_GAP && k < tokens.length; k++) {
      if (tokens[k]?.w === particle) {
        out.push({ start: i, end: k + 1, minConf: minConf(tokens, [...verbIdx, k]) });
        break;
      }
    }
  }
  return out;
}

/** Best occurrence of any form or spelling variant: the one heard most confidently. */
export function matchItem(tokens: Token[], item: Pick<LexItem, "forms" | "spelling_variants" | "separable">): Match | null {
  const all = [...item.forms, ...item.spelling_variants].flatMap((f) => matchPhrase(tokens, f, item.separable));
  if (all.length === 0) return null;
  return all.reduce((best, m) => (m.minConf > best.minConf ? m : best));
}

export function matchesAnyForm(tokens: Token[], forms: string[]): boolean {
  return forms.some((f) => matchPhrase(tokens, f, false).length > 0);
}
