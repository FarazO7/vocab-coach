import { describe, expect, it } from "vitest";
import { FSRS_WEIGHT_COUNT, newCard, retrievability, review } from "./fsrs";

const T = Date.parse("2026-10-26T10:00:00+05:30");
const DAY = 86_400_000;

describe("FSRS adapter (brief §5)", () => {
  it("uses FSRS-6 default weights", () => {
    expect(FSRS_WEIGHT_COUNT).toBe(21);
  });

  it("schedules a new card in whole days with no same-day learning steps", () => {
    const days = (["Again", "Hard", "Good", "Easy"] as const).map((r) => review(newCard(T), T, r).scheduled_days);
    expect(days).toEqual([1, 2, 3, 8]);
  });

  it("is deterministic (fuzz off)", () => {
    const once = review(review(newCard(T), T, "Good"), T + 3 * DAY, "Good");
    const twice = review(review(newCard(T), T, "Good"), T + 3 * DAY, "Good");
    expect(twice).toEqual(once);
  });

  it("reports R = 0 for a never-reviewed card and decaying R after a review", () => {
    expect(retrievability(newCard(T), T)).toBe(0);
    const card = review(newCard(T), T, "Good");
    const r1 = retrievability(card, T + DAY);
    const r5 = retrievability(card, T + 5 * DAY);
    expect(r1).toBeGreaterThan(r5);
    expect(r5).toBeGreaterThan(0);
  });
});
