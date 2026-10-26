import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Brief §8 copy rules: no em dashes and no efficacy claims in anything a learner can read or hear.
const files = (readdirSync("src", { recursive: true }) as string[])
  .filter((f) => /\.(tsx?|json|css|md)$/.test(f) && !/\.test\.tsx?$/.test(f))
  .map((f) => join("src", f));

describe("copy rules", () => {
  it("scans the source tree", () => {
    expect(files.length).toBeGreaterThan(10);
  });

  it.each(files.map((f) => [f]))("%s has no em dashes or efficacy claims", (file) => {
    const text = readFileSync(file, "utf8");
    expect(text.includes("\u2014"), "em dash").toBe(false);
    expect(text.match(/\b(proven|guaranteed?)\b/i)?.[0] ?? null).toBeNull();
  });
});
