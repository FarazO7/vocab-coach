import { z } from "zod";
import { ALLOWLIST, isItemId } from "../engine/lexicon";
import { TOPICS } from "../engine/types";

const itemId = z.string().max(40).refine(isItemId, "unknown item id");
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const hint = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]);

export const DIRECTIVE_TYPES = ["CONVERSE", "SEED", "ELICIT", "HINT", "REVEAL", "CLARIFY", "JUDGE", "RECAP"] as const;

export const DirectiveSchema = z
  .object({ type: z.enum(DIRECTIVE_TYPES), item_id: itemId.nullable(), hint_level: hint, repair_allowed: z.boolean() })
  .strict();

/** SESSION_SUMMARY as typed fields: item and allowlist ids, never free-form prompt text. */
export const SummaryRequestSchema = z
  .object({
    learned: z.array(z.object({ item: itemId, level: z.number().int().min(0).max(5) }).strict()).max(10),
    hinted: z.array(z.object({ item: itemId, nextDue: day }).strict()).max(10),
    spontaneous: z.array(itemId).max(10),
    polish: z.array(z.object({ said: z.string().max(200), suggest: z.string().max(200) }).strict()).max(2),
    alternatives: z.array(z.string().refine((id) => ALLOWLIST.some((a) => a.id === id), "unknown allowlist id")).max(12),
    uncertain: z.array(itemId).max(10),
    dueTomorrow: z.number().int().min(0).max(500),
  })
  .strict();

export const TurnRequestSchema = z
  .object({
    directive: DirectiveSchema,
    candidateIds: z.array(itemId).max(10),
    history: z.array(z.object({ speaker: z.enum(["agent", "learner"]), text: z.string().max(600) }).strict()).max(8),
    utterance: z.string().max(1200),
    profile: z
      .object({
        name: z.string().max(40),
        exam: z.enum(["IELTS", "PTE", "DET", "other"]),
        level: z.enum(["B1", "B2", "not_sure"]),
        interests: z.array(z.enum(TOPICS)).max(3),
      })
      .strict(),
    topic: z.enum(TOPICS),
    summary: SummaryRequestSchema.optional(),
  })
  .strict()
  .superRefine((r, ctx) => {
    const d = r.directive;
    const needsItem = d.type !== "CONVERSE" && d.type !== "RECAP";
    if (needsItem !== (d.item_id !== null)) ctx.addIssue({ code: "custom", path: ["directive", "item_id"], message: "item_id does not fit the directive" });
    if (d.type === "HINT" && d.hint_level === 0) ctx.addIssue({ code: "custom", path: ["directive", "hint_level"], message: "HINT needs a level" });
    if (d.type === "RECAP" && !r.summary) ctx.addIssue({ code: "custom", path: ["summary"], message: "RECAP needs a summary" });
  });

export type TurnRequest = z.infer<typeof TurnRequestSchema>;
export type SummaryRequest = z.infer<typeof SummaryRequestSchema>;

const judgement = z.object({
  appropriate: z.boolean(),
  confidence: z.number().min(0).max(1),
  issue: z.enum(["none", "meaning", "collocation", "form", "mention_not_use"]),
});

/**
 * Brief §6 TurnResult, as sent to OpenAI strict structured output. Strict mode doesn't support
 * string length limits, so TurnResultSchema below re-validates with caps after parsing.
 */
export const LlmTurnSchema = z.object({
  reply: z.string(),
  judgement: judgement.nullable(),
  spontaneous: z.array(z.object({ item_id: z.string(), appropriate: z.boolean(), confidence: z.number().min(0).max(1) })),
  deferred_note: z.object({ said: z.string(), suggest: z.string() }).nullable(),
  learner_state: z.enum(["ok", "frustrated", "wants_to_end"]),
});

export const TurnResultSchema = z.object({
  reply: z.string().trim().min(1).max(1000),
  judgement: judgement.nullable(),
  spontaneous: z
    .array(z.object({ item_id: z.string().max(40), appropriate: z.boolean(), confidence: z.number().min(0).max(1) }))
    .max(10),
  deferred_note: z.object({ said: z.string().trim().min(1).max(200), suggest: z.string().trim().min(1).max(200) }).nullable(),
  learner_state: z.enum(["ok", "frustrated", "wants_to_end"]),
});

export const TtsRequestSchema = z.object({ text: z.string().trim().min(1) }).strict();
