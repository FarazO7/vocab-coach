// Brief §10: fail the build if any secret env value appears in client output.
// Runs after `next build` (see package.json). Prints variable names and files, never values.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export const SECRET_NAMES = ["DEEPGRAM_API_KEY", "OPENAI_API_KEY", "SESSION_SECRET"];

// Client output: every static chunk, plus prerendered HTML and RSC payloads.
const CLIENT_FILES = [
  { dir: ".next/static", match: () => true },
  { dir: ".next/server/app", match: (f) => /\.(html|rsc|body|meta)$/.test(f) },
];

function walk(dir) {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((d) => d.isFile())
    .map((d) => join(d.parentPath, d.name));
}

/** Returns [{ name, file }] for each secret value found in the scanned files. */
export function findLeaks(targets, secrets) {
  const values = Object.entries(secrets).filter(([, v]) => typeof v === "string" && v.length >= 8);
  const leaks = [];
  for (const { dir, match } of targets) {
    if (!existsSync(dir)) continue;
    for (const file of walk(dir).filter(match)) {
      const text = readFileSync(file, "latin1");
      for (const [name, value] of values) if (text.includes(value)) leaks.push({ name, file });
    }
  }
  return leaks;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const secrets = Object.fromEntries(SECRET_NAMES.map((n) => [n, process.env[n]]));
  const present = SECRET_NAMES.filter((n) => (secrets[n] ?? "").length >= 8);
  if (!existsSync(".next/static")) {
    console.error("check-secrets: .next/static not found; run next build first.");
    process.exit(1);
  }
  if (present.length === 0) {
    console.warn("check-secrets: no secret values in the environment to check against (no .env.local?).");
    process.exit(0);
  }
  const leaks = findLeaks(CLIENT_FILES, secrets);
  if (leaks.length) {
    for (const l of leaks) console.error(`check-secrets: ${l.name} found in ${l.file}`);
    process.exit(1);
  }
  console.log(`check-secrets: clean (${present.join(", ")} checked against client output).`);
}
