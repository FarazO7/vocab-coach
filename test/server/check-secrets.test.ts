import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { findLeaks } from "../../scripts/check-secrets.mjs";

const dir = mkdtempSync(join(tmpdir(), "vc-secrets-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("build secret check (brief §10)", () => {
  it("finds a secret value in client output and names the variable, not the value", () => {
    mkdirSync(join(dir, "chunks"), { recursive: true });
    writeFileSync(join(dir, "chunks", "a.js"), 'const k="sk-live-abcdef123456";');
    writeFileSync(join(dir, "chunks", "b.js"), "const ok=1;");
    const leaks = findLeaks([{ dir, match: () => true }], {
      OPENAI_API_KEY: "sk-live-abcdef123456",
      DEEPGRAM_API_KEY: "dg-not-present-999",
    });
    expect(leaks).toEqual([{ name: "OPENAI_API_KEY", file: join(dir, "chunks", "a.js") }]);
  });

  it("ignores values too short to be meaningful", () => {
    const leaks = findLeaks([{ dir, match: () => true }], { SESSION_SECRET: "const" });
    expect(leaks).toEqual([]);
  });
});
