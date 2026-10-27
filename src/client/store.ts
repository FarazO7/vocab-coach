import { closeStaleSessions, dropFutureEvents } from "../engine/replay";
import type { Ev, Profile } from "../engine/types";

export const STORAGE_KEY = "vocab-coach";
export const SCHEMA_VERSION = 1;

export type Rate = 0.8 | 1 | 1.2;

/** Everything the learner has, in this browser only (brief §10). */
export interface Data {
  version: typeof SCHEMA_VERSION;
  adult: boolean; // 18+ confirmed
  profile: Profile | null;
  events: Ev[];
  rate: Rate;
  clockOffsetMs: number; // demo clock (M4); 0 in normal use
}

export const EMPTY: Data = { version: SCHEMA_VERSION, adult: false, profile: null, events: [], rate: 1, clockOffsetMs: 0 };

export interface Backend {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
  keys(): string[];
}

export const RESET_NOTICE =
  "We changed how progress is saved, so this browser's earlier progress was reset. A backup copy was kept, and Export includes it.";
export const UNSAVED_NOTICE = "This browser isn't saving progress (private mode or storage is full). Sessions still work, but nothing is kept.";

function parse(raw: string): Partial<Data> | null {
  try {
    const value: unknown = JSON.parse(raw);
    return value && typeof value === "object" ? (value as Partial<Data>) : null;
  } catch {
    return null; // unreadable data is handled like a version mismatch: backed up, then reset
  }
}

export class Store {
  private data: Data = EMPTY;
  private listeners = new Set<() => void>();
  notice: string | null = null;
  saveError: string | null = null;

  constructor(
    private backend: Backend | null,
    private nowMs: () => number,
  ) {
    this.load();
  }

  private load(): void {
    let raw: string | null;
    try {
      raw = this.backend?.get(STORAGE_KEY) ?? null;
    } catch {
      this.saveError = UNSAVED_NOTICE; // storage blocked: run in memory and say so
      return;
    }
    if (raw !== null) {
      const parsed = parse(raw);
      if (parsed?.version === SCHEMA_VERSION && Array.isArray(parsed.events)) {
        this.data = { ...EMPTY, ...parsed, version: SCHEMA_VERSION };
      } else {
        this.write(`${STORAGE_KEY}:backup:${this.nowMs()}`, raw);
        this.notice = RESET_NOTICE;
        this.persist();
      }
    }
    // Brief §5 Finalise: a session left open by a closed tab is finalised on next load.
    const ends = closeStaleSessions(this.data.events);
    if (ends.length) {
      this.data = { ...this.data, events: [...this.data.events, ...ends] };
      this.persist();
    }
  }

  private write(key: string, value: string): boolean {
    try {
      this.backend?.set(key, value);
      return true;
    } catch {
      this.saveError = UNSAVED_NOTICE;
      return false;
    }
  }

  private persist(): void {
    if (this.write(STORAGE_KEY, JSON.stringify(this.data))) this.saveError = null;
  }

  get = (): Data => this.data;

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  update(fn: (d: Data) => Data): void {
    this.data = fn(this.data);
    this.persist();
    for (const l of this.listeners) l();
  }

  append(events: Ev[]): void {
    if (events.length) this.update((d) => ({ ...d, events: [...d.events, ...events] }));
  }

  /** Export JSON (brief §10): everything stored, including reported corrections and any backups. */
  exportJson(): string {
    let backups: Record<string, string> = {};
    try {
      const keys = this.backend?.keys().filter((k) => k.startsWith(`${STORAGE_KEY}:backup:`)) ?? [];
      backups = Object.fromEntries(keys.map((k) => [k, this.backend?.get(k) ?? ""]));
    } catch {
      backups = {}; // storage unreadable: export what's in memory
    }
    return JSON.stringify({ exportedAt: new Date(this.nowMs()).toISOString(), data: this.data, backups }, null, 2);
  }

  /** Delete all: this app's keys, backups included. */
  deleteAll(): void {
    try {
      for (const k of this.backend?.keys() ?? []) if (k === STORAGE_KEY || k.startsWith(`${STORAGE_KEY}:`)) this.backend?.remove(k);
    } catch {
      this.saveError = UNSAVED_NOTICE;
    }
    this.notice = null;
    this.data = EMPTY;
    for (const l of this.listeners) l();
  }
}

export const DAY_MS = 86_400_000;

/** Brief §9 clock controls: move the demo clock forward by whole days. */
export function advanceClock(store: Store, days: number): void {
  store.update((d) => ({ ...d, clockOffsetMs: d.clockOffsetMs + days * DAY_MS }));
}

/** I13: reset drops events dated after real time (they would break FSRS), closes any session that leaves open, and replays. */
export function resetClock(store: Store, realNow: number): void {
  store.update((d) => {
    const kept = dropFutureEvents(d.events, realNow);
    return { ...d, clockOffsetMs: 0, events: [...kept, ...closeStaleSessions(kept)] };
  });
}

export function browserBackend(): Backend {
  return {
    get: (k) => window.localStorage.getItem(k),
    set: (k, v) => window.localStorage.setItem(k, v),
    remove: (k) => window.localStorage.removeItem(k),
    keys: () => Object.keys(window.localStorage),
  };
}

let singleton: Store | null = null;

/** The app's store; created on first use in the browser. */
export function getStore(): Store {
  singleton ??= new Store(typeof window === "undefined" ? null : browserBackend(), () => Date.now());
  return singleton;
}
