import { describe, expect, it } from "vitest";
import { RESET_NOTICE, SCHEMA_VERSION, Store, STORAGE_KEY, UNSAVED_NOTICE, type Backend } from "../../src/client/store";
import { replay } from "../../src/engine/replay";
import { Driver, plan, voice } from "../helpers";

function memory(initial: Record<string, string> = {}): Backend & { map: Map<string, string> } {
  const map = new Map(Object.entries(initial));
  return { map, get: (k) => map.get(k) ?? null, set: (k, v) => void map.set(k, v), remove: (k) => void map.delete(k), keys: () => [...map.keys()] };
}

const profile = { name: "Asha", exam: "IELTS", level: "B1", interests: [], testDate: null } as const;

describe("local store (brief §10)", () => {
  it("starts empty and persists every update under a versioned key", () => {
    const b = memory();
    const s = new Store(b, () => 1);
    s.update((d) => ({ ...d, adult: true, profile: { ...profile, interests: [] } }));
    const saved = JSON.parse(b.map.get(STORAGE_KEY)!);
    expect(saved).toMatchObject({ version: SCHEMA_VERSION, adult: true, profile: { name: "Asha" } });
    expect(new Store(b, () => 2).get().profile?.name).toBe("Asha");
  });

  it("backs up, resets and tells the user on a version mismatch", () => {
    const old = JSON.stringify({ version: 0, events: [{ k: "x" }] });
    const b = memory({ [STORAGE_KEY]: old });
    const s = new Store(b, () => 1234);
    expect(s.get().events).toEqual([]);
    expect(s.notice).toBe(RESET_NOTICE);
    expect(b.map.get(`${STORAGE_KEY}:backup:1234`)).toBe(old);
    expect(JSON.parse(b.map.get(STORAGE_KEY)!).version).toBe(SCHEMA_VERSION);
  });

  it("treats unreadable data the same way", () => {
    const b = memory({ [STORAGE_KEY]: "{not json" });
    expect(new Store(b, () => 5).notice).toBe(RESET_NOTICE);
    expect(b.map.get(`${STORAGE_KEY}:backup:5`)).toBe("{not json");
  });

  it("finalises a session a closed tab left open, on next load (brief §5)", () => {
    const d = new Driver([], plan({ seeds: ["meticulous_adj"] }));
    d.say(voice("I like planning."));
    const b = memory({ [STORAGE_KEY]: JSON.stringify({ version: SCHEMA_VERSION, adult: true, profile, events: d.events, rate: 1, clockOffsetMs: 0 }) });
    const s = new Store(b, () => 1);
    expect(s.get().events.at(-1)).toMatchObject({ k: "session_end", sid: "s1" });
    expect(replay(s.get().events).sessions[0]?.closed).toBe(true);
  });

  it("exports everything, including backups and reported corrections, and deletes all of it", () => {
    const b = memory({ [STORAGE_KEY]: JSON.stringify({ version: 0 }) });
    const s = new Store(b, () => 9);
    s.append([{ k: "report", key: "s1:1:0", sid: "s1", t: 1, day: "2026-10-27", caption: "Wrong fix" }]);
    const exported = JSON.parse(s.exportJson());
    expect(exported.data.events[0]).toMatchObject({ k: "report", caption: "Wrong fix" });
    expect(Object.keys(exported.backups)).toEqual([`${STORAGE_KEY}:backup:9`]);
    b.map.set("someone-else", "keep");
    s.deleteAll();
    expect([...b.map.keys()]).toEqual(["someone-else"]);
    expect(s.get().events).toEqual([]);
  });

  it("keeps working in memory, and says so, when storage throws", () => {
    const broken: Backend = {
      get: () => {
        throw new Error("SecurityError");
      },
      set: () => {
        throw new Error("QuotaExceededError");
      },
      remove: () => undefined,
      keys: () => [],
    };
    const s = new Store(broken, () => 1);
    expect(s.saveError).toBe(UNSAVED_NOTICE);
    s.update((d) => ({ ...d, adult: true }));
    expect(s.get().adult).toBe(true);
    expect(s.saveError).toBe(UNSAVED_NOTICE);
  });
});
