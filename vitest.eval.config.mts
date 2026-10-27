import { defineConfig } from "vitest/config";

// Evals call real providers and cost money, so they never run with `npm test`.
export default defineConfig({
  test: {
    include: ["evals/**/*.eval.ts"],
    environment: "node",
  },
});
