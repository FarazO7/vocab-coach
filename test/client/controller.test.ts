import { describe, expect, it } from "vitest";
import type { Api } from "../../src/client/api";
import { FILLER_TEXT, SessionController } from "../../src/client/controller";
import type { PlayerLike, PlayOutcome } from "../../src/client/player";
import { truncatePlayed } from "../../src/client/player";
import { Store, type Backend } from "../../src/client/store";
import { leaksTarget } from "../../src/engine/guards";
import { getItem } from "../../src/engine/lexicon";
import { outcomeOf } from "../../src/engine/outcome";
import { replay } from "../../src/engine/replay";
import type { AttemptEv, TurnResult } from "../../src/engine/types";
import type { TurnRequest } from "../../src/server/schemas";
import type { TurnResponse } from "../../src/server/turn";
import { clockAt, seededHistory, T0 } from "../helpers";

const SID = "11111111-1111-4111-8111-111111111111";

function memory(): Backend {
  const map = new Map<string, string>();
  return { get: (k) => map.get(k) ?? null, set: (k, v) => void map.set(k, v), remove: (k) => void map.delete(k), keys: () => [...map.keys()] };
}

/** A scripted /api/turn: answers by directive type and records every request. */
function fakeApi(answer: (req: TurnRequest) => Partial<TurnResult> | null, opts: { voiceEnabled?: boolean } = {}) {
  const requests: TurnRequest[] = [];
  const tts: string[] = [];
  const api: Api = {
    session: async () => ({ token: "t", sid: SID, expiresAt: Date.now() + 600_000, voiceEnabled: opts.voiceEnabled ?? false }),
    stt: async () => ({ transcript: "", words: [], durationS: 0, ms: 1 }),
    turn: async (req) => {
      requests.push(req);
      const a = answer(req);
      if (a === null) throw new Error("network down");
      const result: TurnResult = { reply: "OK.", judgement: null, spontaneous: [], deferred_note: null, learner_state: "ok", ...a };
      return { result, guards: [], usage: { input_tokens: 0, cached_tokens: 0, cache_write_tokens: 0, output_tokens: 0, reasoning_tokens: 0 }, calls: 1, llmMs: 5, fallback: false } satisfies TurnResponse;
    },
    tts: async (text) => {
      tts.push(text);
      return new Response(new Uint8Array(10));
    },
  };
  return { api, requests, tts };
}

function setup(answer: Parameters<typeof fakeApi>[0], history = seededHistory("meticulous_adj"), voiceEnabled = false, player: PlayerLike | null = null) {
  const store = new Store(memory(), () => 0);
  store.update((d) => ({ ...d, adult: true, profile: { name: "Asha", exam: "IELTS", level: "B1", interests: ["work_study"], testDate: null }, events: history }));
  let t = T0;
  const { api, requests, tts } = fakeApi(answer, { voiceEnabled });
  // A second per clock read: the controller reads the clock several times per turn.
  const ctl = new SessionController({ api, player, store, clock: () => clockAt((t += 1000)), mic: async () => ({ recorder: null, note: null }) });
  return { ctl, store, requests, tts };
}

describe("text mode end to end (DoD 8)", () => {
  it("runs a due word through the hint ladder to a reveal, then recaps, with no microphone", async () => {
    const M = "meticulous_adj";
    const replies: Record<string, string> = {
      CONVERSE: "Hi Asha! How was work today?",
      ELICIT: "Who at your office checks every small detail?",
      HINT: "Here's a clue: it means very careful about every small detail.",
      REVEAL: "The word is meticulous: very careful about every small detail. Can you use it?",
      RECAP: "Well done today.",
    };
    const { ctl, store, requests } = setup((req) => ({ reply: req.directive.type === "HINT" && req.directive.hint_level === 3 ? "Is it meticulous or careless?" : (replies[req.directive.type] ?? "OK.") }));
    await ctl.start({ wantVoice: false });
    expect(ctl.view).toMatchObject({ phase: "idle", voiceIn: false, voiceOut: false });

    await ctl.submitText("It was busy.");
    for (let i = 0; i < 4; i++) await ctl.dontKnow();
    await ctl.submitText("Sorry, no idea.");
    await ctl.end();

    const types = requests.map((r) => `${r.directive.type}${r.directive.type === "HINT" ? r.directive.hint_level : ""}`);
    // After the reveal resolves the due word, rule 1 plants the session's first new word.
    expect(types).toEqual(["CONVERSE", "ELICIT", "HINT1", "HINT2", "HINT3", "REVEAL", "SEED", "RECAP"]);
    // The word never appears on screen or in captions before hint 3 (DoD 2).
    const captionsBeforeHint3 = ctl.view.captions.slice(0, 4).map((c) => c.text);
    for (const c of captionsBeforeHint3) expect(leaksTarget(c, getItem(M))).toBe(false);
    expect(ctl.view.phase).toBe("done");
    expect(ctl.view.recapText).toBe("Well done today.");
    // Events were appended as they happened, and the session is finalised.
    const events = store.get().events.filter((e) => e.sid === SID);
    expect(events[0]?.k).toBe("session_start");
    expect(events.at(-1)?.k).toBe("session_end");
    const attempt = events.find((e): e is AttemptEv => e.k === "attempt");
    expect(outcomeOf(attempt!).kind).toBe("miss");
    expect(replay(store.get().events).sessions.find((s) => s.sid === SID)?.closed).toBe(true);
  });

  it("sends typed fields only, with history capped at 8 turns and the RECAP summary as ids", async () => {
    const { ctl, requests } = setup(() => ({ reply: "Tell me more." }), []);
    await ctl.start({ wantVoice: false });
    for (let i = 0; i < 6; i++) await ctl.submitText(`Sentence number ${i}.`);
    await ctl.end();
    for (const r of requests) expect(r.history.length).toBeLessThanOrEqual(8);
    const recap = requests.at(-1)!;
    expect(recap.directive.type).toBe("RECAP");
    expect(Object.keys(recap.summary!)).toEqual(["learned", "hinted", "spontaneous", "polish", "alternatives", "uncertain", "dueTomorrow"]);
  });

  it("falls back to the lexicon template when /api/turn is unreachable", async () => {
    const { ctl } = setup((req) => (req.directive.type === "CONVERSE" ? { reply: "Hello!" } : null));
    await ctl.start({ wantVoice: false });
    await ctl.submitText("Work was busy.");
    expect(ctl.view.captions.at(-1)?.text).toBe("Think of an adjective that means 'very careful about every small detail'. Can you use it in a sentence about work and study?");
    expect(ctl.view.phase).toBe("idle");
  });

  it("stores a reported correction in the event log", async () => {
    const { ctl, store } = setup(() => ({ reply: "You should say 'bring forward', not 'prepone'." }), []);
    await ctl.start({ wantVoice: false });
    ctl.report(ctl.view.captions[0]!.id);
    expect(store.get().events.some((e) => e.k === "report" && e.caption.includes("prepone"))).toBe(true);
    expect(ctl.view.captions[0]?.reported).toBe(true);
  });
});

describe("audio output", () => {
  it("speaks every reply through TTS and stores only what was heard after a barge-in", async () => {
    // The first reply keeps playing until stop(); later ones finish at once.
    let holding: ((o: PlayOutcome) => void) | null = null;
    let plays = 0;
    const player: PlayerLike = {
      unlock: () => undefined,
      play: (_res, _rate, onFirst) =>
        new Promise((resolve) => {
          onFirst();
          if (++plays === 1) holding = resolve;
          else resolve({ stopped: false, fraction: 1 });
        }),
      replay: () => null,
      playClip: async () => ({ stopped: false, fraction: 1 }),
      stop: () => holding?.({ stopped: true, fraction: 0.5 }),
    };
    const { ctl, requests, tts } = setup(() => ({ reply: "One two three four five six seven eight." }), [], true, player);
    const starting = ctl.start({ wantVoice: false });
    await new Promise((r) => setTimeout(r, 0));
    expect(ctl.view.phase).toBe("speaking");
    player.stop(); // interrupt halfway
    await starting;
    await ctl.submitText("Hello.");
    expect(tts.filter((t) => t !== FILLER_TEXT)[0]).toBe("One two three four five six seven eight.");
    expect(requests[1]?.history[0]).toEqual({ speaker: "agent", text: "One two three four..." });
  });

  it("keeps going with captions only when TTS fails", async () => {
    const { ctl } = setup(() => ({ reply: "Hello!" }), [], true, {
      unlock: () => undefined,
      play: async () => {
        throw new Error("decode failed");
      },
      replay: () => null,
      playClip: async () => ({ stopped: false, fraction: 1 }),
      stop: () => undefined,
    });
    await ctl.start({ wantVoice: false });
    expect(ctl.view).toMatchObject({ phase: "idle", notice: "The audio didn't load, so here is the text." });
    expect(ctl.view.captions[0]?.text).toBe("Hello!");
  });
});

describe("filler phrase (should-have)", () => {
  function run(turnDelayMs: number) {
    const clips: string[] = [];
    const order: string[] = [];
    const player: PlayerLike = {
      unlock: () => undefined,
      play: async () => {
        order.push("reply");
        return { stopped: false, fraction: 1 };
      },
      replay: () => null,
      playClip: async () => {
        clips.push("filler");
        order.push("filler");
        await new Promise((r) => setTimeout(r, 30)); // the reply arrives while the filler is still playing
        return { stopped: false, fraction: 1 };
      },
      stop: () => undefined,
    };
    const store = new Store(memory(), () => 0);
    store.update((d) => ({ ...d, adult: true, profile: { name: "", exam: "IELTS", level: "B1", interests: [], testDate: null } }));
    const { api, requests, tts } = fakeApi(() => ({ reply: "Here is my reply." }), { voiceEnabled: true });
    const slowApi: Api = { ...api, turn: async (r) => (await new Promise((res) => setTimeout(res, turnDelayMs)), api.turn(r)) };
    let t = T0;
    const ctl = new SessionController({ api: slowApi, player, store, clock: () => clockAt((t += 1000)), fillerAfterMs: 20, mic: async () => ({ recorder: null, note: null }) });
    return { ctl, clips, order, requests, tts };
  }

  it("plays the cached filler once when the reply is slow, then the reply; never as a turn", async () => {
    const { ctl, clips, order, tts, requests } = run(60);
    await ctl.start({ wantVoice: false });
    await ctl.submitText("Hello there.");
    expect(clips).toHaveLength(2); // once per slow turn
    expect(order).toEqual(["filler", "reply", "filler", "reply"]);
    expect(tts.filter((t) => t === "Hmm, let me think.")).toHaveLength(1); // rendered once, then cached
    expect(ctl.view.captions.map((c) => c.text)).toEqual(["Here is my reply.", "Here is my reply."]);
    expect(requests[1]?.history.some((h) => h.text.includes("let me think"))).toBe(false);
  });

  it("stays quiet when the reply is quick", async () => {
    const { ctl, clips } = run(0);
    await ctl.start({ wantVoice: false });
    await new Promise((r) => setTimeout(r, 40));
    expect(clips).toHaveLength(0);
  });
});

describe("barge-in truncation (brief §7)", () => {
  it.each([
    [1, "one two three four"],
    [0.98, "one two three four"],
    [0.5, "one two..."],
    [0.1, ""],
  ])("fraction %f keeps %j", (fraction, kept) => {
    expect(truncatePlayed("one two three four", fraction)).toBe(kept);
  });
});
