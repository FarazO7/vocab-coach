"use client";

import { useMemo, useSyncExternalStore } from "react";
import { replay, type Model } from "../engine/replay";
import type { Clock } from "../engine/types";
import { clockNow } from "./clock";
import { getStore, type Data } from "./store";

const subscribe = (fn: () => void) => getStore().subscribe(fn);

/** The stored data, or null during server rendering (localStorage only exists in the browser). */
export function useData(): Data | null {
  return useSyncExternalStore(subscribe, () => getStore().get(), () => null);
}

/** The learner model, rebuilt from the event log whenever it changes. */
export function useModel(data: Data | null): Model | null {
  const events = data?.events;
  return useMemo(() => (events ? replay(events) : null), [events]);
}

export function useClock(data: Data | null): Clock | null {
  const offset = data?.clockOffsetMs;
  return useMemo(() => (offset === undefined ? null : clockNow(offset)), [offset]);
}
