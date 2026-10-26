import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Brief §5 "Clock" and PLAN I19: the engine never reads a clock or a random source,
// so replaying the event log always rebuilds the same learner model.
export const engineBans = [
  {
    selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
    message: "Engine functions take `now` as a parameter; Date.now() is banned in src/engine.",
  },
  {
    selector: "NewExpression[callee.name='Date'][arguments.length=0]",
    message: "Argument-less new Date() reads the clock; pass `now` instead.",
  },
  {
    selector: "CallExpression[callee.name='Date']",
    message: "Date() reads the clock; pass `now` instead.",
  },
  {
    selector: "CallExpression[callee.object.name='Math'][callee.property.name='random']",
    message: "Math.random() breaks replay determinism.",
  },
  {
    selector: "CallExpression[callee.object.name='performance'][callee.property.name='now']",
    message: "performance.now() reads the clock; pass `now` instead.",
  },
];

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", "out/**", "next-env.d.ts", "samples/**"]),
  // Pages Router rule; this app uses the App Router, and the rule warns when no pages/ directory exists.
  { rules: { "@next/next/no-html-link-for-pages": "off" } },
  {
    files: ["src/engine/**/*.ts"],
    rules: { "no-restricted-syntax": ["error", ...engineBans] },
  },
]);
