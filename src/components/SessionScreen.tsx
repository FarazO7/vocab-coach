"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { createApi } from "../client/api";
import { clockNow } from "../client/clock";
import { SessionController, type Phase, type View } from "../client/controller";
import { useData } from "../client/hooks";
import { formatDay } from "../client/labels";
import { Player } from "../client/player";
import { getStore } from "../client/store";
import { DEFAULTS } from "../config/defaults";
import { getItem, isItemId } from "../engine/lexicon";
import type { Chip } from "../engine/session";
import { RecapView } from "./RecapView";
import { Button, Card, LinkButton, Loading, Notice } from "./ui";

const ORB: Record<Phase, { label: string; className: string }> = {
  ready: { label: "Ready", className: "bg-stone-300" },
  starting: { label: "Starting", className: "bg-amber-600" },
  idle: { label: "Tap to talk", className: "bg-teal-700 hover:bg-teal-800" },
  listening: { label: "Listening. Tap when you're done", className: "bg-rose-700 animate-pulse" },
  thinking: { label: "Thinking", className: "bg-amber-600" },
  speaking: { label: "Speaking. Tap to interrupt", className: "bg-teal-600" },
  finishing: { label: "Wrapping up", className: "bg-amber-600" },
  done: { label: "Done", className: "bg-stone-400" },
};

const TYPING_LABEL: Record<Phase, string> = {
  ...Object.fromEntries(Object.entries(ORB).map(([k, v]) => [k, v.label])),
  idle: "Your turn. Type below",
  speaking: "Speaking",
} as Record<Phase, string>;

export function SessionScreen() {
  const data = useData();
  const params = useSearchParams();
  const practiseParam = params.get("practise");
  const practise = practiseParam && isItemId(practiseParam) ? practiseParam : undefined;
  const [ctl] = useState(() => {
    const store = getStore();
    return new SessionController({
      api: createApi(),
      player: typeof Audio === "undefined" ? null : new Player(),
      store,
      clock: () => clockNow(store.get().clockOffsetMs),
    });
  });
  useEffect(() => () => ctl.dispose(), [ctl]);

  const view = useSyncExternalStore(ctl.subscribe, ctl.getView, ctl.getView);
  if (!data) return <Loading />;
  if (!data.profile) {
    return (
      <p className="pt-4 text-stone-800">
        First, <LinkButton href={data.adult ? "/onboarding" : "/"} variant="ghost" className="px-0">tell me a little about you</LinkButton>.
      </p>
    );
  }
  if (view.phase === "ready" || view.phase === "starting") return <Ready ctl={ctl} view={view} practise={practise} firstSession={!data.events.some((e) => e.k === "session_end")} />;
  return <Active ctl={ctl} view={view} />;
}

function Ready({ ctl, view, practise, firstSession }: { ctl: SessionController; view: View; practise?: string; firstSession: boolean }) {
  const starting = view.phase === "starting";
  return (
    <div className="space-y-5 pt-2">
      <h1 className="text-2xl font-semibold text-stone-900">Ready when you are</h1>
      {view.notice && <Notice tone="warn">{view.notice}</Notice>}
      <Card>
        <ul className="list-disc space-y-1 pl-5 text-sm text-stone-800">
          <li>About {firstSession ? DEFAULTS.firstSessionS / 60 : DEFAULTS.laterSessionS / 60} minutes.</li>
          <li>Tap the circle to talk, and tap again when you have finished. On a computer you can hold Space instead.</li>
          <li>Captions are always on, and you can type instead at any time.</li>
          {practise && <li>We will start with &ldquo;{getItem(practise).lemma}&rdquo;.</li>}
        </ul>
      </Card>
      <div className="flex flex-wrap gap-3">
        <Button disabled={starting} onClick={() => void ctl.start({ wantVoice: true, practise })}>
          {starting ? "Starting…" : "Start with voice"}
        </Button>
        <Button variant="secondary" disabled={starting} onClick={() => void ctl.start({ wantVoice: false, practise })}>
          Start with typing
        </Button>
      </div>
      <p className="text-xs text-stone-700">Your browser will ask to use the microphone. Audio isn&apos;t stored.</p>
    </div>
  );
}

function useTick(active: boolean) {
  const [, setN] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setN((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [active]);
}

function Active({ ctl, view }: { ctl: SessionController; view: View }) {
  const [typing, setTyping] = useState(!view.voiceIn);
  const [draft, setDraft] = useState("");
  const phaseRef = useRef(view.phase);
  useEffect(() => {
    phaseRef.current = view.phase;
  }, [view.phase]);
  const running = view.phase !== "done" && view.phase !== "finishing";
  useTick(running);

  const lastCaption = useRef<HTMLDivElement>(null);
  const captionCount = view.captions.length;
  useEffect(() => {
    lastCaption.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [captionCount]);

  // Hold Space to talk on desktop (brief §2), unless the learner is typing or on a control.
  useEffect(() => {
    if (!view.voiceIn) return;
    const skip = (e: KeyboardEvent) => e.code !== "Space" || e.repeat || (e.target as HTMLElement).closest("input, textarea, select, button, a, summary");
    const down = (e: KeyboardEvent) => {
      if (skip(e)) return;
      e.preventDefault();
      if (phaseRef.current === "idle" || phaseRef.current === "speaking") void ctl.micTap();
    };
    const up = (e: KeyboardEvent) => {
      if (skip(e)) return;
      e.preventDefault();
      if (phaseRef.current === "listening") void ctl.micTap();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [ctl, view.voiceIn]);

  const elapsed = view.startedAt ? Math.max(0, clockNow(getStore().get().clockOffsetMs).t - view.startedAt) : 0;
  const canTalk = view.phase === "idle" || view.phase === "speaking";
  const orb = ORB[view.phase];

  const send = (e: FormEvent) => {
    e.preventDefault();
    const text = draft;
    setDraft("");
    void ctl.submitText(text);
  };

  if (view.phase === "done" || view.phase === "finishing") {
    return (
      <div className="space-y-4 pt-2">
        <h1 className="text-2xl font-semibold text-stone-900">Session complete</h1>
        {view.phase === "finishing" && !view.recapText ? <Loading /> : view.sid && <RecapView sid={view.sid} recapText={view.recapText} />}
        <div className="flex flex-wrap gap-3">
          <LinkButton href="/">Home</LinkButton>
          <LinkButton href="/notebook" variant="secondary">
            Notebook
          </LinkButton>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 pt-2">
      <div className="flex items-center justify-between text-sm text-stone-700">
        <span aria-label="Session time">{formatTime(elapsed)}</span>
        {view.modeNote && <span className="max-w-[70%] text-right">{view.modeNote}</span>}
      </div>

      <div className="flex flex-col items-center gap-3">
        <button
          type="button"
          aria-label={orb.label}
          disabled={!view.voiceIn || !(canTalk || view.phase === "listening")}
          onClick={() => void ctl.micTap()}
          className={`flex h-28 w-28 items-center justify-center rounded-full text-white shadow-md transition-colors disabled:cursor-default ${orb.className} ${
            view.voiceIn ? "" : "opacity-50 shadow-none"
          }`}
        >
          {view.voiceIn ? <MicIcon /> : <KeyboardIcon />}
        </button>
        <p className="text-sm font-medium text-stone-800" aria-live="polite">
          {view.voiceIn ? orb.label : TYPING_LABEL[view.phase]}
        </p>
        <ChipView chip={view.chip} />
      </div>

      {view.notice && <Notice tone="warn">{view.notice}</Notice>}

      <section aria-label="Captions" role="log" aria-live="polite" className="space-y-3">
        {view.captions.map((c, i) => (
          <div key={c.id} ref={i === view.captions.length - 1 ? lastCaption : undefined} className="scroll-mb-40 rounded-xl bg-white p-3 ring-1 ring-stone-200">
            <p className="text-stone-900">{c.text}</p>
            <button
              type="button"
              className="mt-1 text-xs text-stone-700 underline-offset-2 hover:underline disabled:no-underline"
              disabled={c.reported}
              onClick={() => ctl.report(c.id)}
            >
              {c.reported ? "Reported. Thank you." : "Report a wrong correction"}
            </button>
          </div>
        ))}
      </section>

      {view.lines.length > 0 && (
        <details className="text-sm text-stone-600">
          <summary className="cursor-pointer">What I heard from you</summary>
          <ul className="mt-2 space-y-1">
            {view.lines.map((l) => (
              <li key={l.id}>
                {l.words
                  ? l.words.map((w, i) => (
                      <span
                        key={i}
                        title={w.conf < DEFAULTS.asrConfFloor ? "Heard with low confidence" : undefined}
                        className={w.conf < DEFAULTS.asrConfFloor ? "underline decoration-amber-700 decoration-dotted underline-offset-4" : undefined}
                      >
                        {w.w}{" "}
                      </span>
                    ))
                  : l.text}
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* Pinned to the bottom so the answer box and buttons stay reachable on a phone. */}
      <div className="sticky bottom-0 -mx-4 space-y-3 border-t border-stone-200 bg-stone-50/95 px-4 pb-4 pt-3 backdrop-blur">
      {(typing || !view.voiceIn) && (
        <form onSubmit={send} className="flex gap-2">
          <label className="sr-only" htmlFor="say">
            Type your answer
          </label>
          <input
            id="say"
            className="min-h-11 flex-1 rounded-lg border border-stone-300 bg-white px-3 text-base"
            value={draft}
            maxLength={1200}
            autoComplete="off"
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Type your answer"
          />
          <Button type="submit" disabled={!canTalk || !draft.trim()}>
            Send
          </Button>
        </form>
      )}

      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" disabled={!canTalk} onClick={() => void ctl.dontKnow()}>
          I don&apos;t know
        </Button>
        <Button variant="secondary" disabled={!view.voiceOut || !canTalk} onClick={() => void ctl.repeatSlower()}>
          Repeat slower
        </Button>
        {view.voiceIn && (
          <Button variant="secondary" aria-pressed={typing} onClick={() => setTyping((t) => !t)}>
            {typing ? "Hide typing" : "Type instead"}
          </Button>
        )}
        <Button variant="secondary" disabled={!canTalk && view.phase !== "listening"} onClick={() => void ctl.end()}>
          End
        </Button>
      </div>
      </div>
    </div>
  );
}

/** Brief §8 target chip. The engine decides what may be shown; this only formats it. */
function ChipView({ chip }: { chip: Chip }) {
  if (chip.kind === "none") return null;
  const text =
    chip.kind === "word"
      ? chip.text
      : chip.kind === "options"
        ? `${chip.options[0]} or ${chip.options[1]}?`
        : [chip.pos, chip.learnt ? `learnt ${formatDay(chip.learnt)}` : null, chip.onset ? `starts with “${chip.onset}”` : null]
            .filter(Boolean)
            .join(" · ");
  return (
    <p className="rounded-full bg-teal-50 px-3 py-1 text-sm text-teal-900 ring-1 ring-teal-200" aria-label="Target word clue">
      {text}
    </p>
  );
}

function MicIcon() {
  return (
    <svg aria-hidden="true" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  );
}

function KeyboardIcon() {
  return (
    <svg aria-hidden="true" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10" />
    </svg>
  );
}

function formatTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
