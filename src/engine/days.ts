import type { Day } from "./types";

const DAY_MS = 86_400_000;
const utc = (d: Day): number => Date.parse(`${d}T00:00:00Z`);

/** Local calendar day for a timestamp. tzOffsetMin is Date#getTimezoneOffset() (IST is -330). */
export const dayOf = (t: number, tzOffsetMin: number): Day => new Date(t - tzOffsetMin * 60_000).toISOString().slice(0, 10);

export const addDays = (d: Day, n: number): Day => new Date(utc(d) + n * DAY_MS).toISOString().slice(0, 10);

/** Whole days from a to b (positive when b is later). */
export const diffDays = (a: Day, b: Day): number => Math.round((utc(b) - utc(a)) / DAY_MS);
