import { z } from "zod";
import rawLexicon from "../data/lexicon.json";
import rawAllowlist from "../data/dialect_allowlist.json";
import { CEFR, TOPICS, type ItemId } from "./types";

const text = (max: number) => z.string().min(1).max(max);

export const LexItemSchema = z
  .object({
    id: z.string().regex(/^[a-z_]+$/),
    lemma: text(40),
    type: z.enum(["word", "phrase", "phrasal_verb"]),
    pos: text(20),
    cefr_est: z.enum(CEFR),
    freq_band: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    topics: z.array(z.enum(TOPICS)).min(1),
    definition_simple: text(120),
    collocations: z.array(text(60)).length(2),
    example: text(160),
    forms: z.array(text(40)).min(1),
    spelling_variants: z.array(text(40)),
    separable: z.boolean(),
    hint_onset: text(12),
    distractor: text(40),
    confusables: z.array(text(40)),
    source: z.literal("author-drafted"),
    reviewed: z.boolean(),
  })
  .strict();
export type LexItem = z.infer<typeof LexItemSchema>;

export const AllowEntrySchema = z
  .object({
    id: z.string().regex(/^[a-z_]+$/),
    phrase: text(40),
    forms: z.array(text(40)).min(1),
    meaning: text(80),
    international: z.string().max(40).nullable(),
    reviewed: z.boolean(),
  })
  .strict();
export type AllowEntry = z.infer<typeof AllowEntrySchema>;

export const LEXICON: readonly LexItem[] = z.array(LexItemSchema).parse(rawLexicon);
export const ALLOWLIST: readonly AllowEntry[] = z.array(AllowEntrySchema).parse(rawAllowlist);

const byId = new Map(LEXICON.map((item) => [item.id, item]));
const order = new Map(LEXICON.map((item, i) => [item.id, i]));

export const isItemId = (id: string): boolean => byId.has(id);

export function getItem(id: ItemId): LexItem {
  const item = byId.get(id);
  if (!item) throw new Error(`Unknown lexicon item: ${id}`);
  return item;
}

export const lexiconIndex = (id: ItemId): number => order.get(id) ?? Number.MAX_SAFE_INTEGER;

/** Confusable in either direction, compared by lemma. */
export function confusable(a: LexItem, b: LexItem): boolean {
  const lower = (xs: string[]) => xs.map((x) => x.toLowerCase());
  return lower(a.confusables).includes(b.lemma.toLowerCase()) || lower(b.confusables).includes(a.lemma.toLowerCase());
}
