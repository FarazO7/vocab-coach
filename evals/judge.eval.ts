import { mkdirSync, writeFileSync } from "node:fs";
import { expect, it } from "vitest";
import { getItem } from "../src/engine/lexicon";
import { fallbackReply } from "../src/engine/templates";
import { getEnv } from "../src/server/env";
import { openAiLlm } from "../src/server/providers/llm";
import { TurnRequestSchema } from "../src/server/schemas";
import { runTurn } from "../src/server/turn";
import cases from "./judge-cases.json";

// Should-have judge eval (brief §1): 30 labelled learner sentences across 10 items, run through the real
// JUDGE path, reporting agreement with the labels. Run: npm run eval:judge (needs .env.local; about $0.01).
process.loadEnvFile?.(".env.local");

const EFFORTS = (process.env.EVAL_EFFORTS ?? "none,low").split(",") as ("none" | "low" | "medium" | "high")[];
const CONCURRENCY = 5;

interface Row {
  id: number;
  item: string;
  label: boolean;
  verdict: boolean | null;
  confidence: number | null;
  issue: string | null;
  llmMs: number;
  guards: string[];
}

function request(c: (typeof cases)[number]) {
  const item = getItem(c.item);
  const topic = item.topics[0]!;
  // The learner is answering a SEED invitation, as in a real session.
  const invite = fallbackReply({ type: "SEED", item_id: item.id, hint_level: 0, repair_allowed: false }, { item, topic, sid: "eval" });
  return TurnRequestSchema.parse({
    directive: { type: "JUDGE", item_id: item.id, hint_level: 0, repair_allowed: true },
    candidateIds: [],
    history: [{ speaker: "agent", text: invite }],
    utterance: c.sentence,
    profile: { name: "", exam: "IELTS", level: "B1", interests: [] },
    topic,
  });
}

async function runAll(effort: (typeof EFFORTS)[number]): Promise<Row[]> {
  const llm = openAiLlm(getEnv({ ...process.env, LLM_REASONING_EFFORT: effort }));
  const rows: Row[] = [];
  for (let i = 0; i < cases.length; i += CONCURRENCY) {
    const batch = await Promise.all(
      cases.slice(i, i + CONCURRENCY).map(async (c) => {
        const out = await runTurn(request(c), "eval", llm);
        const j = out.result.judgement;
        return { id: c.id, item: c.item, label: c.appropriate, verdict: j?.appropriate ?? null, confidence: j?.confidence ?? null, issue: j?.issue ?? null, llmMs: out.llmMs, guards: out.guards };
      }),
    );
    rows.push(...batch);
  }
  return rows;
}

/** Agreement, Cohen's kappa, and how many verdicts the engine would treat as UNCERTAIN (confidence below 0.6). */
export function score(rows: Row[]) {
  const judged = rows.filter((r) => r.verdict !== null);
  const agree = judged.filter((r) => r.verdict === r.label).length;
  const n = judged.length || 1;
  const po = agree / n;
  const pLabel = judged.filter((r) => r.label).length / n;
  const pVerdict = judged.filter((r) => r.verdict).length / n;
  const pe = pLabel * pVerdict + (1 - pLabel) * (1 - pVerdict);
  const kappa = pe === 1 ? 1 : (po - pe) / (1 - pe);
  const uncertain = judged.filter((r) => (r.confidence ?? 0) < 0.6).length;
  const confident = judged.filter((r) => (r.confidence ?? 0) >= 0.6);
  const confidentAgree = confident.filter((r) => r.verdict === r.label).length;
  const ms = rows.map((r) => r.llmMs).sort((a, b) => a - b);
  return {
    cases: rows.length,
    noJudgement: rows.length - judged.length,
    agreement: po,
    kappa,
    belowFloor: uncertain,
    confidentAgreement: confident.length ? confidentAgree / confident.length : 0,
    falseAccepts: judged.filter((r) => r.verdict && !r.label).map((r) => r.id),
    falseRejects: judged.filter((r) => !r.verdict && r.label).map((r) => r.id),
    llmMsP50: ms[Math.floor(ms.length / 2)] ?? 0,
  };
}

it(
  "reports judge agreement with the labels",
  async () => {
    const report: Record<string, unknown> = {};
    for (const effort of EFFORTS) {
      const rows = await runAll(effort);
      const s = score(rows);
      report[effort] = { ...s, rows };
      console.info(
        `\nreasoning ${effort}: agreement ${(s.agreement * 100).toFixed(0)}%, kappa ${s.kappa.toFixed(2)}, ` +
          `below 0.6 floor ${s.belowFloor}/${s.cases}, no judgement ${s.noJudgement}, ` +
          `false accepts [${s.falseAccepts.join(", ")}], false rejects [${s.falseRejects.join(", ")}], LLM p50 ${s.llmMsP50} ms`,
      );
    }
    mkdirSync("evals/results", { recursive: true });
    writeFileSync("evals/results/judge-latest.json", JSON.stringify({ ranAt: new Date().toISOString(), model: getEnv().LLM_MODEL, report }, null, 2));
    expect(Object.keys(report)).toEqual(EFFORTS);
  },
  300_000,
);
