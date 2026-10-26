import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
// @ts-expect-error plain .mjs script, no type declarations
import { render } from "../scripts/lexicon-review.mjs";

it("LEXICON_REVIEW.md matches the lexicon data (run npm run lexicon:review)", () => {
  expect(readFileSync("LEXICON_REVIEW.md", "utf8")).toBe((render as () => string)());
});
