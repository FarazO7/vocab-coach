import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

// Guard for brief §5 "Clock" and I19: prove the engine lint rule actually fires.
const eslint = new ESLint();

async function bans(code: string, filePath: string): Promise<number> {
  const [r] = await eslint.lintText(code, { filePath });
  return r?.messages.filter((m) => m.ruleId === "no-restricted-syntax").length ?? -1;
}

describe("engine determinism lint rule", () => {
  it.each(["Date.now()", "new Date()", "Date()", "Math.random()", "performance.now()"])(
    "bans %s in src/engine",
    async (expr) => {
      expect(await bans(`export const f = () => ${expr};\n`, "src/engine/probe.ts")).toBe(1);
    },
    60_000,
  );

  it("allows clock-free date maths in src/engine", async () => {
    expect(await bans("export const f = (t: number) => [new Date(t), Date.parse('2026-01-01')];\n", "src/engine/probe.ts")).toBe(0);
  }, 60_000);

  it("doesn't apply outside src/engine (the UI owns the clock)", async () => {
    expect(await bans("export const now = () => Date.now();\n", "src/client/clock.ts")).toBe(0);
  }, 60_000);
});
