// Renders LEXICON_REVIEW.md from src/data/*.json. Run: npm run lexicon:review
// test/lexicon-review.test.ts fails if the committed file drifts from the data.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = new URL("../", import.meta.url);
const read = (p) => JSON.parse(readFileSync(new URL(p, root), "utf8"));

const TOPICS = [
  ["work_study", "Work and study"],
  ["city_transport", "City and transport"],
  ["environment", "Environment"],
  ["technology", "Technology"],
  ["health_lifestyle", "Health and lifestyle"],
  ["education", "Education"],
  ["travel", "Travel"],
];

// Drafting questions for the reviewer. Each one is a judgement call, not a rule change.
const QUESTIONS = [
  "**mitigate and exacerbate** are opposites in Environment, and mitigate's distractor (aggravate, from the brief's example) means exacerbate. They aren't marked as confusables, so both can be seeded on the same day. Keep, mark them confusable (which breaks the one-topic rule), or swap exacerbate for another Environment word?",
  "**congested and bustling** (City and transport) both describe crowded places: congested is negative, bustling is lively. Keep both?",
  "**setback and drawback** are marked as confusables of each other (different topics), so the planner never seeds or reviews them on the same day. OK?",
  "**curb** (Environment) and **cut down on** (Health) overlap in meaning across topics and aren't marked confusable. OK?",
  "**burnout** accepts the spelling `burn-out`, so a learner saying the verb \"burn out\" also gets credit. Speech-to-text often splits the word, which is why I added it. Keep?",
  "**immerse yourself in** is matched as `immerse … in` with up to three words between, so \"immersed myself in\" and the passive \"immersed in\" both count. Keep?",
  "**Hint 2 onsets are written as sounds** (for example `ig-zas` for exacerbate, `yoo-bik` for ubiquitous, `groo` for gruelling), because the agent speaks them. Happy with that, or would you rather have spelling-based onsets?",
  "**CEFR levels and frequency bands are my estimates**, not taken from a licensed list (research §15 flags licensing as open).",
  "**Allowlist: passed out** means \"graduated\" in Indian English but \"fainted\" elsewhere. The allowlist only stops it being corrected; it never changes meaning detection. OK?",
];

// Sign-off: the 40 words, 12 allowlist entries and judge-case labels were approved as drafted,
// with every question above answered "keep as is".
const APPROVED_ON = "27 Oct 2026";

const cell = (s) => String(s).replaceAll("|", "\\|");
const list = (xs) => (xs.length ? xs.map(cell).join("; ") : "none");

export function render() {
  const lexicon = read("src/data/lexicon.json");
  const allowlist = read("src/data/dialect_allowlist.json");
  const reviewed = lexicon.filter((i) => i.reviewed).length;
  const allowReviewed = allowlist.filter((e) => e.reviewed).length;
  const approved = reviewed === lexicon.length && allowReviewed === allowlist.length;
  const out = [];

  out.push("# Lexicon review", "");
  out.push("Generated from `src/data/lexicon.json` and `src/data/dialect_allowlist.json` by `npm run lexicon:review`. Do not edit by hand.", "");
  if (approved) {
    out.push(
      `Status: approved ${APPROVED_ON}, as drafted: all ${lexicon.length} words, all ${allowlist.length} allowlist entries, and the judge-case labels in \`evals/judge-cases.json\`. Swaps from the brief's word list: none.`,
      "",
    );
    out.push("To change anything now, propose it in `CHANGES.md` first (brief §0 rule 4). `test/approved-content.test.ts` fails if these files change without a new sign-off.", "");
  } else {
    out.push(`Status: ${reviewed} of ${lexicon.length} items reviewed; ${allowReviewed} of ${allowlist.length} allowlist entries reviewed. Everything is \`author-drafted\` until you approve it.`, "");
    out.push("How to review: tell me which rows to change (or approve all), and I'll update the JSON, set `reviewed: true`, and regenerate this file. Swaps from the brief's word list: none.", "");
  }
  out.push("Columns: **Hint 2** is the first sound the agent says; **Hint 3** is the wrong option offered next to the word; **Confusables** are never seeded or reviewed on the same day as the word.", "");

  out.push(approved ? `## Review questions (answered ${APPROVED_ON}: keep everything as is)` : "## Questions for you", "");
  QUESTIONS.forEach((q, i) => out.push(`${i + 1}. ${q}`));
  out.push("");

  let n = 0;
  for (const [id, label] of TOPICS) {
    const items = lexicon.filter((i) => i.topics.includes(id));
    out.push(`## ${label} (${items.length})`, "");
    out.push("| # | Word | POS | CEFR | Band | Definition | Collocations | Example | Forms and variants | Hint 2 | Hint 3 | Confusables | Reviewed |");
    out.push("|---|---|---|---|---|---|---|---|---|---|---|---|---|");
    for (const i of items) {
      n += 1;
      const forms = [...i.forms, ...i.spelling_variants.map((v) => `${v} (variant)`)];
      const word = i.separable ? `${i.lemma} (separable)` : i.lemma;
      out.push(
        `| ${n} | **${cell(word)}** | ${cell(i.pos)} | ${i.cefr_est} | ${i.freq_band} | ${cell(i.definition_simple)} | ${list(i.collocations)} | ${cell(i.example)} | ${list(forms)} | ${cell(i.hint_onset)} | ${cell(i.distractor)} | ${list(i.confusables)} | ${i.reviewed ? "yes" : "no"} |`,
      );
    }
    out.push("");
  }

  out.push(`## Dialect allowlist (${allowlist.length})`, "");
  out.push("Indian English forms that are never treated as errors. The recap may offer the international form as another way to say it, never as a correction.", "");
  out.push("| Phrase | Forms matched | Meaning | International option | Reviewed |");
  out.push("|---|---|---|---|---|");
  for (const e of allowlist) {
    out.push(`| **${cell(e.phrase)}** | ${list(e.forms)} | ${cell(e.meaning)} | ${cell(e.international ?? "none")} | ${e.reviewed ? "yes" : "no"} |`);
  }
  out.push("");
  return out.join("\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const target = fileURLToPath(new URL("LEXICON_REVIEW.md", root));
  writeFileSync(target, render());
  console.log(`Wrote ${target}`);
}
