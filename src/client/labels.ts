import { diffDays } from "../engine/days";
import type { Day } from "../engine/types";

// Evidence ladder (brief §5) in learner-facing words. Level 1 is unused in the prototype.
const LEVELS = ["New", "Recognised", "Recalled with a hint", "Recalled", "Used in a sentence", "Used on your own"];

export const levelLabel = (level: number, mastered = false): string => (mastered ? "★ Mastered" : (LEVELS[level] ?? "New"));

export const formatDay = (day: Day): string =>
  new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(
    Date.parse(`${day}T00:00:00Z`),
  );

export function dueLabel(day: Day, today: Day): string {
  const n = diffDays(today, day);
  if (n <= 0) return "due now";
  if (n === 1) return "due tomorrow";
  return `due ${formatDay(day)}`;
}
