// Renders the same vocabulary-tutor script in the three candidate Aura-2 voices (PLAN §8),
// so the voice can be chosen by ear. Nothing is selected or saved to config here.
// Run: npm run voices:render   (reads DEEPGRAM_API_KEY from .env.local)
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const VOICES = ["aura-2-draco-en", "aura-2-pandora-en", "aura-2-harmonia-en"];

// One SEED turn and one HINT turn, written like the agent's real replies (each under 40 words).
export const SCRIPT =
  "You mentioned your long commute. A useful word here is gruelling: very tiring and difficult over a long time. " +
  "People say 'a gruelling commute'. Can you make your own sentence with it? " +
  "Here's a clue for another word: it means very careful about every small detail. It starts with 'me-ti'.";

const key = process.env.DEEPGRAM_API_KEY;
if (!key) {
  console.error("DEEPGRAM_API_KEY is missing. Add it to .env.local (see .env.example), then run: npm run voices:render");
  process.exit(1);
}
if (SCRIPT.length > 600) throw new Error("Sample script exceeds the 600-character TTS cap");

const outDir = fileURLToPath(new URL("../samples/voices/", import.meta.url));
mkdirSync(outDir, { recursive: true });

for (const voice of VOICES) {
  const url = `https://api.deepgram.com/v1/speak?model=${voice}&encoding=mp3&bit_rate=48000&mip_opt_out=true`;
  const started = performance.now();
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Token ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ text: SCRIPT }),
  });
  if (!res.ok) {
    console.error(`${voice}: HTTP ${res.status} ${await res.text()}`);
    process.exitCode = 1;
    continue;
  }
  const audio = Buffer.from(await res.arrayBuffer());
  const ms = Math.round(performance.now() - started);
  const file = `${outDir}${voice}.mp3`;
  writeFileSync(file, audio);
  console.log(`${voice}: ${(audio.length / 1024).toFixed(0)} KB in ${ms} ms -> ${file}`);
}
console.log(`Script (${SCRIPT.length} characters): ${SCRIPT}`);
