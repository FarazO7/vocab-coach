export type Intent = "dont_know" | "repeat" | "end";

// Regex backup for the buttons (brief §5 Intent). "repeat" and "end" only fire as commands,
// so "at the end of the day" or "I repeat the class" stay ordinary speech.
const DONT_KNOW = /\b(?:i\s+)?(?:don'?t|do not)\s+know\b|\bdunno\b|\bforgot(?:ten)?\b|\bno idea\b|\bcan(?:'?t|not) remember\b/;
const REPEAT =
  /^(?:sorry[,.!]?\s*)?(?:pardon|repeat|say (?:that|it) again)\b|\b(?:can|could|would) you (?:please )?(?:repeat|say (?:that|it) again)\b/;
const END = /^(?:please\s+)?(?:stop|end)\b|\b(?:let'?s|i want to|i'd like to|can we)\s+(?:stop|end)\b/;

export function detectIntent(text: string, button?: Intent): Intent | null {
  if (button) return button;
  const s = text.toLowerCase().replace(/[‘’]/g, "'").trim();
  if (END.test(s)) return "end";
  if (REPEAT.test(s)) return "repeat";
  if (DONT_KNOW.test(s)) return "dont_know";
  return null;
}
