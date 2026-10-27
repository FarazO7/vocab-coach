import { DEFAULTS } from "../config/defaults";
import { EMPTY_METER, type Meter } from "../config/pricing";
import { detectIntent } from "../engine/intent";
import { getItem } from "../engine/lexicon";
import { tokensFromText, tokensFromWords } from "../engine/matcher";
import { planSession } from "../engine/planner";
import { closeSession, closeStaleSessions, replay, type Model } from "../engine/replay";
import {
  apply,
  played,
  reportCaption,
  requestEnd,
  startSession,
  step,
  targetChip,
  type Chip,
  type SessionState,
} from "../engine/session";
import { buildSummary, type SessionSummary } from "../engine/summary";
import { EMPTY_TRANSCRIPT_REPLY, fallbackReply } from "../engine/templates";
import type { Clock, Directive, Ev, ItemId, LearnerTurn, Profile, TurnResult } from "../engine/types";
import type { SummaryRequest, TurnRequest } from "../server/schemas";
import type { TurnResponse } from "../server/turn";
import type { Api, SttOut } from "./api";
import { truncatePlayed, type PlayerLike } from "./player";
import { micErrorReason, openMic, pickMimeType, Recorder, voiceUnsupportedReason } from "./recorder";
import type { Rate, Store } from "./store";

export type Phase = "ready" | "starting" | "idle" | "listening" | "thinking" | "speaking" | "finishing" | "done";

export interface Caption {
  id: number;
  text: string;
  reported: boolean;
}

export interface Line {
  id: number;
  text: string;
  words: { w: string; conf: number }[] | null; // voice only; low-confidence words get underlined
}

export interface Latency {
  sttMs: number | null;
  turnMs: number;
  llmMs: number | null;
  ttsFirstMs: number | null; // from the end of the learner's turn to the first agent audio
  totalMs: number | null;
}

/** What the session screen (and, in M4, Under the hood) renders. */
export interface View {
  phase: Phase;
  voiceIn: boolean;
  voiceOut: boolean;
  modeNote: string | null;
  notice: string | null;
  captions: Caption[];
  lines: Line[];
  chip: Chip;
  directive: Directive | null;
  sid: string | null;
  startedAt: number | null; // clock time, for the timer
  latency: Latency | null;
  lastTurn: { response: TurnResponse | null; stt: SttOut | null } | null;
  summary: SessionSummary | null;
  recapText: string | null;
  state: SessionState | null;
  meter: Meter; // measured usage this session, for the cost meter
}

export interface Deps {
  api: Api;
  player: PlayerLike | null; // null when the browser can't play audio
  store: Store;
  clock: () => Clock;
  perf?: () => number;
  /** Override mic setup (tests); default opens the real microphone. */
  mic?: () => Promise<{ recorder: Recorder | null; note: string | null }>;
}

const INITIAL: View = {
  phase: "ready",
  voiceIn: false,
  voiceOut: false,
  modeNote: null,
  notice: null,
  captions: [],
  lines: [],
  chip: { kind: "none" },
  directive: null,
  sid: null,
  startedAt: null,
  latency: null,
  lastTurn: null,
  summary: null,
  recapText: null,
  state: null,
  meter: EMPTY_METER,
};

const START_FAILED = "We couldn't start a session. Check your connection and try again.";
const HEARD_NOTHING = "Sorry, I didn't catch that. Could you say it again?";
const AUDIO_FAILED = "The audio didn't load, so here is the text.";

async function defaultMic(onAutoStop: () => void): Promise<{ recorder: Recorder | null; note: string | null }> {
  const unsupported = voiceUnsupportedReason();
  const mime = pickMimeType();
  if (unsupported || !mime) return { recorder: null, note: unsupported };
  try {
    return { recorder: new Recorder(await openMic(), mime, onAutoStop), note: null };
  } catch (e) {
    return { recorder: null, note: micErrorReason(e) };
  }
}

/**
 * One learning session: engine + routes + audio. The engine decides; this class only moves data
 * between the learner, the engine, the server and the speakers, and appends events as they happen.
 */
export class SessionController {
  view: View = INITIAL;
  private listeners = new Set<() => void>();
  private s: SessionState | null = null;
  private model: Model = replay([]);
  private profile: Profile | null = null;
  private history: TurnRequest["history"] = [];
  private recorder: Recorder | null = null;
  private seq = 0;
  private turnStarted = 0;
  private perf: () => number;

  constructor(private deps: Deps) {
    this.perf = deps.perf ?? (() => performance.now());
  }

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getView = (): View => this.view;

  private set(patch: Partial<View>): void {
    this.view = { ...this.view, ...patch, state: this.s };
    for (const l of this.listeners) l();
  }

  private bump(add: Partial<Meter>): void {
    const m = this.view.meter;
    this.set({
      meter: {
        sttSeconds: m.sttSeconds + (add.sttSeconds ?? 0),
        ttsChars: m.ttsChars + (add.ttsChars ?? 0),
        inputTokens: m.inputTokens + (add.inputTokens ?? 0),
        cachedTokens: m.cachedTokens + (add.cachedTokens ?? 0),
        cacheWriteTokens: m.cacheWriteTokens + (add.cacheWriteTokens ?? 0),
        outputTokens: m.outputTokens + (add.outputTokens ?? 0),
      },
    });
  }

  private rate(): Rate {
    return this.deps.store.get().rate;
  }

  private append(events: Ev[]): void {
    this.deps.store.append(events);
  }

  private refreshChip(): void {
    if (this.s) this.set({ chip: targetChip(this.s, this.model, this.deps.clock().day) });
  }

  /** The Start tap. Unlock audio and ask for the mic first, inside the user gesture (brief §7). */
  async start(opts: { wantVoice: boolean; practise?: ItemId }): Promise<void> {
    const profile = this.deps.store.get().profile;
    if (!profile || this.view.phase !== "ready") return;
    this.profile = profile;
    this.deps.player?.unlock();
    const mic = opts.wantVoice ? await (this.deps.mic ?? (() => defaultMic(() => void this.micTap())))() : { recorder: null, note: null };
    this.recorder = mic.recorder;
    this.set({ phase: "starting", notice: null, modeNote: mic.note });

    let info;
    try {
      info = await this.deps.api.session();
    } catch {
      this.recorder?.close();
      this.recorder = null;
      this.set({ phase: "ready", notice: START_FAILED });
      return;
    }
    let modeNote = mic.note;
    if (!info.voiceEnabled) {
      this.recorder?.close();
      this.recorder = null;
      modeNote = "Voice is switched off right now, so this session uses typing and captions.";
    }

    this.append(closeStaleSessions(this.deps.store.get().events));
    this.model = replay(this.deps.store.get().events);
    const clock = this.deps.clock();
    const plan = planSession({ model: this.model, profile, today: clock.day, now: clock.t, practise: opts.practise });
    const started = startSession(plan, info.sid, clock);
    this.s = started.state;
    this.append(started.events);
    this.set({
      sid: info.sid,
      startedAt: clock.t,
      voiceIn: this.recorder !== null,
      voiceOut: info.voiceEnabled && this.deps.player !== null,
      modeNote,
    });
    this.turnStarted = this.perf();
    await this.agent(started.directive, [], "", this.history);
  }

  /** Tap (or Space): start talking, stop talking, or interrupt the agent (barge-in). */
  async micTap(): Promise<void> {
    const r = this.recorder;
    if (!r) return;
    const phase = this.view.phase;
    if (phase === "speaking") {
      this.deps.player?.stop(); // speak() records only what was heard
      r.start();
      this.set({ phase: "listening", notice: null });
    } else if (phase === "idle") {
      r.start();
      this.set({ phase: "listening", notice: null });
    } else if (phase === "listening") {
      await this.sendRecording(r);
    }
  }

  private async sendRecording(r: Recorder): Promise<void> {
    this.turnStarted = this.perf();
    this.set({ phase: "thinking" });
    const rec = await r.stop();
    if (!rec) {
      this.set({ phase: "idle" }); // a tap under 0.3 s is ignored (brief §7)
      return;
    }
    let stt: SttOut;
    try {
      stt = await this.deps.api.stt(rec.blob); // the route already retried once
    } catch {
      this.set({ phase: "idle", notice: HEARD_NOTHING });
      return;
    }
    this.set({ lastTurn: { response: null, stt } });
    this.bump({ sttSeconds: stt.durationS });
    if (!stt.transcript.trim()) {
      await this.speak(EMPTY_TRANSCRIPT_REPLY, false); // no LLM call, not a learner turn
      return;
    }
    if (detectIntent(stt.transcript) === "repeat") {
      await this.repeatSlower();
      return;
    }
    const sttMs = this.perf() - this.turnStarted;
    await this.learner({ tokens: tokensFromWords(stt.words), text: stt.transcript, modality: "voice" }, stt.words, sttMs);
  }

  async submitText(text: string): Promise<void> {
    const clean = text.trim().slice(0, 1200);
    if (!clean || !this.canTalk()) return;
    this.deps.player?.stop();
    this.turnStarted = this.perf();
    await this.learner({ tokens: tokensFromText(clean), text: clean, modality: "text" }, null, null);
  }

  async dontKnow(): Promise<void> {
    if (!this.canTalk()) return;
    this.deps.player?.stop();
    this.turnStarted = this.perf();
    await this.learner({ tokens: tokensFromText("I don't know"), text: "I don't know", modality: "text", button: "dont_know" }, null, null);
  }

  private canTalk(): boolean {
    return this.view.phase === "idle" || this.view.phase === "speaking";
  }

  /** Repeat slower: the last reply at 0.8x, no API call, not a learner turn (I14). */
  async repeatSlower(): Promise<void> {
    const replaying = this.deps.player?.replay(0.8);
    if (!replaying) {
      this.set({ phase: "idle" });
      return;
    }
    this.set({ phase: "speaking" });
    await replaying;
    if (this.view.phase === "speaking") this.set({ phase: "idle" });
  }

  /** The End button: not a learner turn; abandons any open await and recaps. */
  async end(): Promise<void> {
    if (!this.s || !["idle", "speaking", "listening"].includes(this.view.phase)) return;
    this.deps.player?.stop();
    if (this.recorder?.recording) await this.recorder.stop();
    const out = requestEnd(this.s, this.deps.clock());
    this.s = out.state;
    this.append(out.events);
    await this.finish();
  }

  report(captionId: number): void {
    const c = this.view.captions.find((x) => x.id === captionId);
    if (!c || c.reported || !this.s) return;
    const out = reportCaption(this.s, c.text, this.deps.clock());
    this.s = out.state;
    this.append(out.events);
    this.set({ captions: this.view.captions.map((x) => (x.id === captionId ? { ...x, reported: true } : x)) });
  }

  private async learner(turn: LearnerTurn, words: SttOut["words"] | null, sttMs: number | null): Promise<void> {
    if (!this.s) return;
    this.set({
      phase: "thinking",
      notice: null,
      lines: [...this.view.lines, { id: ++this.seq, text: turn.text, words: words?.map(({ w, conf }) => ({ w, conf })) ?? null }],
    });
    const out = step(this.s, turn, this.model, this.deps.clock());
    this.s = out.state;
    this.append(out.events);
    const history = this.history.slice(-DEFAULTS.historyTurns);
    this.history.push({ speaker: "learner", text: turn.text.slice(0, 600) });
    if (out.directive.type === "RECAP") {
      await this.finish();
      return;
    }
    await this.agent(out.directive, out.candidates, turn.text, history, sttMs);
  }

  private request(directive: Directive, candidates: ItemId[], utterance: string, history: TurnRequest["history"], summary?: SummaryRequest): TurnRequest {
    const p = this.profile!;
    return {
      directive,
      candidateIds: candidates,
      history: history.slice(-DEFAULTS.historyTurns), // a copy, capped here for every caller
      utterance: utterance.slice(0, 1200),
      profile: { name: p.name.slice(0, 40), exam: p.exam, level: p.level, interests: p.interests.slice(0, 3) },
      topic: this.s!.topic,
      ...(summary ? { summary } : {}),
    };
  }

  private async agent(
    directive: Directive,
    candidates: ItemId[],
    utterance: string,
    history: TurnRequest["history"],
    sttMs: number | null = null,
    summary?: { request: SummaryRequest; engine: SessionSummary },
  ): Promise<void> {
    if (!this.s) return;
    this.set({ phase: "thinking", directive });
    this.refreshChip();
    const t0 = this.perf();
    let response: TurnResponse | null = null;
    try {
      response = await this.deps.api.turn(this.request(directive, candidates, utterance, history, summary?.request));
    } catch (e) {
      console.warn("turn failed:", e instanceof Error ? e.message : e); // fall through to the lexicon template
    }
    if (response) {
      const u = response.usage;
      this.bump({ inputTokens: u.input_tokens, cachedTokens: u.cached_tokens, cacheWriteTokens: u.cache_write_tokens, outputTokens: u.output_tokens });
    }
    const result: TurnResult | null = response?.result ?? null;
    const item = directive.item_id ? getItem(directive.item_id) : null;
    const reply = result?.reply ?? fallbackReply(directive, { item, topic: this.s.topic, sid: this.s.sid, summary: summary?.engine });
    if (directive.type !== "RECAP") {
      const applied = apply(this.s, result, this.deps.clock());
      this.s = applied.state;
      this.append(applied.events);
    }
    this.refreshChip();
    const turnMs = this.perf() - t0;
    this.set({
      latency: { sttMs, turnMs, llmMs: response?.llmMs ?? null, ttsFirstMs: null, totalMs: null },
      lastTurn: { response, stt: this.view.lastTurn?.stt ?? null },
      ...(directive.type === "RECAP" ? { recapText: reply } : {}),
    });
    await this.speak(reply, true);
  }

  /** Speak with captions always on. Only what was heard goes into history (barge-in). */
  private async speak(text: string, isTurn: boolean): Promise<void> {
    const id = ++this.seq;
    this.set({ captions: [...this.view.captions, { id, text, reported: false }] });
    let heard = text;
    const player = this.deps.player;
    if (this.view.voiceOut && player) {
      this.set({ phase: "speaking" });
      try {
        const res = await this.deps.api.tts(text);
        this.bump({ ttsChars: text.length });
        const outcome = await player.play(res, this.rate(), () => {
          const first = this.perf() - this.turnStarted;
          const l = this.view.latency;
          this.set({ latency: l ? { ...l, ttsFirstMs: first, totalMs: first } : null });
          console.info(JSON.stringify({ latency: { ...l, totalMs: Math.round(first) } }));
        });
        if (outcome.stopped) heard = truncatePlayed(text, outcome.fraction);
      } catch (e) {
        console.warn("tts failed:", e instanceof Error ? e.message : e);
        this.set({ notice: AUDIO_FAILED });
      }
    }
    if (isTurn && this.s) {
      this.s = played(this.s, heard);
      this.history.push({ speaker: "agent", text: heard.slice(0, 600) });
    }
    if (this.view.phase === "speaking" || this.view.phase === "thinking") this.set({ phase: this.s?.ended ? "done" : "idle" });
  }

  private async finish(): Promise<void> {
    if (!this.s) return;
    this.set({ phase: "finishing", chip: { kind: "none" } });
    const clock = this.deps.clock();
    const end = closeSession(this.deps.store.get().events, this.s.sid, clock);
    if (end) this.append([end]);
    const events = this.deps.store.get().events;
    const model = replay(events);
    const engine = buildSummary(events, this.s.sid, model, clock.day);
    const dialect = [...new Set(events.flatMap((e) => (e.sid === this.s?.sid && e.k === "dialect" ? [e.entry] : [])))];
    const request: SummaryRequest = {
      learned: engine.learned.map(({ item, level }) => ({ item, level })),
      hinted: engine.hinted.map(({ item, nextDue }) => ({ item, nextDue })),
      spontaneous: engine.spontaneous.map((x) => x.item),
      polish: engine.polish.map((p) => ({ said: p.said.slice(0, 200), suggest: p.suggest.slice(0, 200) })),
      alternatives: dialect,
      uncertain: engine.uncertain.map((x) => x.item),
      dueTomorrow: engine.dueTomorrow,
    };
    this.set({ summary: engine });
    const recap: Directive = { type: "RECAP", item_id: null, hint_level: 0, repair_allowed: false };
    this.turnStarted = this.perf();
    await this.agent(recap, [], "", this.history.slice(-DEFAULTS.historyTurns), null, { request, engine });
    this.recorder?.close(); // brief §7: stop the tracks at the end
    this.recorder = null;
    this.set({ phase: "done" });
  }

  dispose(): void {
    this.deps.player?.stop();
    this.recorder?.close();
    this.recorder = null;
  }
}
