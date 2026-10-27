import { dayOf } from "../engine/days";
import type { Clock } from "../engine/types";

/** Brief §5 Clock: real time plus the demo offset. The engine only ever sees this value. */
export function clockNow(offsetMs: number): Clock {
  const t = Date.now() + offsetMs;
  return { t, day: dayOf(t, new Date(t).getTimezoneOffset()) };
}
