import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Brief §0 rule 4: once approved, factual content doesn't change without sign-off.
// Approved 27 Oct 2026 as drafted. To change any of these: propose it in CHANGES.md, get approval,
// edit the file, then update its hash here in the same commit.
const APPROVED: Record<string, string> = {
  "src/data/lexicon.json": "dd8b584cfa5fa6a461c1bf1ae9b8f802c680e7d07a02dcf035a664034516cc31",
  "src/data/dialect_allowlist.json": "56230c8737a8cd45e9d591aaace113bd8be5b134aaa471881b1968d091e69981",
  "evals/judge-cases.json": "0df5dae481a88e585f23ed48c4a02cd4a907d28cd80574e67b1a87a38c738324",
};

describe("approved content is unchanged (brief §0 rule 4)", () => {
  it.each(Object.entries(APPROVED))("%s matches its approved version", (file, hash) => {
    const actual = createHash("sha256").update(readFileSync(file)).digest("hex");
    expect(actual, `${file} changed after approval: propose the change in CHANGES.md first`).toBe(hash);
  });
});
