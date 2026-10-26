import type { AttemptEv, Rating } from "./types";

export type OutcomeKind = "success" | "miss" | "uncertain" | "none";

export interface Outcome {
  kind: OutcomeKind;
  level: number | null; // attempt level for a success
  rating: Rating | null; // the rating FSRS gets if this is the day's scheduled outcome
}

const HARSHNESS: Rating[] = ["Again", "Hard", "Good", "Easy"];
const harsher = (a: Rating, b: Rating): Rating => (HARSHNESS.indexOf(a) <= HARSHNESS.indexOf(b) ? a : b);

const MISS: Outcome = { kind: "miss", level: null, rating: "Again" };

/**
 * Brief §5 outcome table. When several rows apply, the lowest level and the harsher rating win.
 * The session state machine has already applied the confidence floors (uncertain) and D2/D3/I5-I7.
 */
export function outcomeOf(a: AttemptEv): Outcome {
  if (a.uncertain) return { kind: "uncertain", level: null, rating: null };
  if (a.abandoned) return { kind: "none", level: null, rating: null };

  if (a.mode === "spontaneous") {
    return a.judge?.appropriate ? { kind: "success", level: 5, rating: "Easy" } : { kind: "none", level: null, rating: null };
  }

  if (!a.targetUsed || a.revealed || a.hints >= 3) return MISS;
  // D2: a fragment answering an ELICIT or HINT skips the appropriateness verdict.
  const ok = (a.mode === "elicit" && a.fragment) || a.judge?.appropriate === true;
  if (!ok) return MISS;

  let level = a.mode === "elicit" && a.fragment ? 3 : 4;
  let rating: Rating = "Good";
  if (a.hints >= 1) {
    level = Math.min(level, 2);
    rating = harsher(rating, "Hard");
  }
  if (a.repaired) {
    level = Math.min(level, 4);
    rating = harsher(rating, "Hard");
  }
  return { kind: "success", level, rating };
}

/** Brief §5 Ladder, including the pinned miss rule. */
export function nextLevel(level: number, o: Outcome): number {
  if (o.kind === "success" && o.level !== null) return Math.max(level, o.level);
  if (o.kind === "miss") return level >= 3 ? Math.max(level - 1, 2) : level;
  return level;
}
