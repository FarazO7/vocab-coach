"use client";

import { useClock, useData } from "../client/hooks";
import { formatDay } from "../client/labels";
import { DAY_MS } from "../client/store";

/** Brief §9: a banner whenever the demo clock is offset. */
export function ClockBanner() {
  const data = useData();
  const clock = useClock(data);
  if (!data || !clock || data.clockOffsetMs === 0) return null;
  const days = Math.round(data.clockOffsetMs / DAY_MS);
  return (
    <p role="status" className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
      Demo clock: {days} day{days === 1 ? "" : "s"} ahead, so today is {formatDay(clock.day)}. Due words and the recap use that date. Reset it in Under the hood.
    </p>
  );
}
