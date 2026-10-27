// Prints the summary of the last judge eval (evals/results/judge-latest.json). Run by npm run eval:judge.
import { readFileSync } from "node:fs";

const r = JSON.parse(readFileSync(new URL("../evals/results/judge-latest.json", import.meta.url), "utf8"));
console.log(`Judge eval: ${r.model}, ${r.ranAt}`);
for (const [effort, s] of Object.entries(r.report)) {
  console.log(
    `  reasoning ${effort}: agreement ${(s.agreement * 100).toFixed(0)}%, kappa ${s.kappa.toFixed(2)}, ` +
      `below the 0.6 floor ${s.belowFloor}/${s.cases}, no judgement ${s.noJudgement}, LLM p50 ${s.llmMsP50} ms`,
  );
  for (const row of s.rows.filter((x) => x.verdict !== x.label)) {
    console.log(`    disagreed on #${row.id} ${row.item}: label ${row.label}, verdict ${row.verdict} (${row.confidence}, ${row.issue})`);
  }
}
