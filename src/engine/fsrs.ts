import { createEmptyCard, default_w, fsrs, generatorParameters, Rating as R, type Card, type Grade } from "ts-fsrs";
import { DEFAULTS } from "../config/defaults";
import type { Rating } from "./types";

// Brief §5 FSRS: FSRS-6 default weights, retention 0.90, no fuzz, day-based (no same-day learning steps).
const scheduler = fsrs(
  generatorParameters({ request_retention: DEFAULTS.desiredRetention, enable_fuzz: false, enable_short_term: false }),
);

const GRADE: Record<Rating, Grade> = { Again: R.Again, Hard: R.Hard, Good: R.Good, Easy: R.Easy };

export const FSRS_WEIGHT_COUNT = default_w.length;

export type { Card };

export const newCard = (t: number): Card => createEmptyCard(new Date(t));

export const review = (card: Card, t: number, rating: Rating): Card => scheduler.next(card, new Date(t), GRADE[rating]).card;

/** Never-reviewed cards count as R = 0 (brief §5 Planner). */
export const retrievability = (card: Card, now: number): number =>
  card.reps === 0 ? 0 : scheduler.get_retrievability(card, new Date(now), false);
