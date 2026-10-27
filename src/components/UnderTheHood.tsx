"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";
import { getActive, subscribeActive } from "../client/active";
import type { View } from "../client/controller";
import { useClock, useData, useModel } from "../client/hooks";
import { formatDay, levelLabel } from "../client/labels";
import { advanceClock, DAY_MS, getStore, resetClock } from "../client/store";
import { DEFAULTS } from "../config/defaults";
import { PRICES, sessionCost } from "../config/pricing";
import { retrievability } from "../engine/fsrs";
import { getItem, isItemId } from "../engine/lexicon";
import { matchItem, tokensFromWords } from "../engine/matcher";
import { outcomeOf } from "../engine/outcome";
import type { Model } from "../engine/replay";
import { awaitedVisible } from "../engine/session";
import type { AttemptEv, Clock, Ev } from "../engine/types";

const noSubscribe = () => () => undefined;
const usd = (n: number) => `$${n.toFixed(4)}`;
const ms = (n: number | null | undefined) => (n == null ? "n/a" : `${Math.round(n)} ms`);

/** Brief §9 Under the hood: makes the engine's decisions and the spacing visible to a reviewer. */
export function UnderTheHood() {
  const [open, setOpen] = useState(false);
  const data = useData();
  const model = useModel(data);
  const clock = useClock(data);
  const ctl = useSyncExternalStore(subscribeActive, getActive, () => null);
  const view = useSyncExternalStore(ctl?.subscribe ?? noSubscribe, () => ctl?.getView() ?? null, () => null);
  if (!data?.profile || !model || !clock) return null;

  const inSession = !!view && view.phase !== "ready" && view.phase !== "done";
  return (
    <div className="mb-4">
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="text-sm font-medium text-teal-800 underline-offset-4 hover:underline">
        Under the hood {open ? "▾" : "▸"}
      </button>
      {open && (
        <div className="mt-2 space-y-4 rounded-xl border border-stone-300 bg-white p-3 text-xs text-stone-800">
          <ClockControls offsetMs={data.clockOffsetMs} clock={clock} events={data.events} disabled={inSession} />
          {view && view.phase !== "ready" && <SessionDetails view={view} events={data.events} />}
          <ModelTable model={model} clock={clock} />
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-1">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-stone-600">{title}</h3>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="w-28 shrink-0 text-stone-600">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

/** Click handler for Reset (never called during render): confirm before dropping demo-clock events. */
function resetToRealTime(events: Ev[]): void {
  const now = Date.now();
  const future = events.filter((e) => e.t > now).length;
  if (future && !window.confirm(`Resetting drops ${future} event${future === 1 ? "" : "s"} recorded on the demo clock. Continue?`)) return;
  resetClock(getStore(), now);
}

function ClockControls({ offsetMs, clock, events, disabled }: { offsetMs: number; clock: Clock; events: Ev[]; disabled: boolean }) {
  const store = getStore();
  const days = Math.round(offsetMs / DAY_MS);
  const reset = () => resetToRealTime(events);
  return (
    <Section title="Clock">
      <p>
        {days === 0 ? "Real time" : `${days} day${days === 1 ? "" : "s"} ahead`}, today is {formatDay(clock.day)}.
      </p>
      <div className="flex flex-wrap gap-2">
        {[1, 3, 7].map((n) => (
          <button key={n} type="button" disabled={disabled} onClick={() => advanceClock(store, n)} className="min-h-9 rounded-md border border-stone-300 px-3 disabled:text-stone-400">
            +{n} day{n === 1 ? "" : "s"}
          </button>
        ))}
        <button type="button" disabled={disabled || offsetMs === 0} onClick={reset} className="min-h-9 rounded-md border border-stone-300 px-3 disabled:text-stone-400">
          Reset
        </button>
      </div>
      {disabled && <p className="text-stone-600">Finish the session to change the clock.</p>}
    </Section>
  );
}

function SessionDetails({ view, events }: { view: View; events: Ev[] }) {
  const [show, setShow] = useState(false);
  const s = view.state;
  const a = s?.await ?? null;
  const visible = awaitedVisible(a) || show;
  const name = (id: string | null | undefined) => (!id ? "none" : visible ? getItem(id).lemma : "hidden until hint 3");
  const words = view.lastTurn?.stt?.words ?? null;
  const match = a && words ? matchItem(tokensFromWords(words), getItem(a.item)) : null;
  const response = view.lastTurn?.response ?? null;
  const last = events.filter((e): e is AttemptEv => e.sid === view.sid && e.k === "attempt").at(-1);
  const outcome = last ? outcomeOf(last) : null;
  const cost = sessionCost(view.meter);
  const d = view.directive;

  return (
    <>
      <Section title="Session">
        <dl className="space-y-0.5">
          <Row label="Phase">{view.phase}</Row>
          {s && (
            <Row label="State">
              turn {s.learnerTurns}; plan {s.plan.due.length} due and {s.plan.seeds.length} new; {s.seeded.length} seeded; {s.stretched.length} stretched
              {s.frustrated ? "; frustrated (CONVERSE only)" : ""}
            </Row>
          )}
          <Row label="Directive">{d ? `${d.type}${d.type === "HINT" ? ` ${d.hint_level}` : ""} ${name(d.item_id)}${d.repair_allowed ? ", repair allowed" : ""}` : "none"}</Row>
          <Row label="Awaited item">
            {a ? `${name(a.item)} (${a.mode}, hint level ${a.hints}${a.revealed ? ", revealed" : ""}${a.repairPrompted ? ", repair asked" : ""}${a.clarified ? ", clarified" : ""})` : "none"}
            {a && !awaitedVisible(a) && (
              <button type="button" className="ml-2 text-teal-800 underline" onClick={() => setShow((v) => !v)}>
                {show ? "Hide" : "Show"}
              </button>
            )}
          </Row>
        </dl>
        {a && !awaitedVisible(a) && <p className="text-stone-600">Hidden so the panel doesn&apos;t give the answer away (D14).</p>}
      </Section>

      <Section title="Last turn">
        <dl className="space-y-0.5">
          <Row label="Transcript">
            {words?.length
              ? words.map((w, i) => (
                  <span key={i} className={w.conf < DEFAULTS.asrConfFloor ? "font-semibold text-amber-800" : undefined}>
                    {w.w}
                    <sub className="text-stone-500">{w.conf.toFixed(2)}</sub>{" "}
                  </span>
                ))
              : "typed or none"}
          </Row>
          <Row label="Matcher">{a ? (match ? `target present, min confidence ${match.minConf.toFixed(2)}` : words ? "target absent" : "n/a (typed)") : "no awaited item"}</Row>
          <Row label="LLM">
            {response
              ? `${response.result.judgement ? `judged ${response.result.judgement.appropriate ? "appropriate" : "not appropriate"} (${response.result.judgement.confidence.toFixed(2)}, ${response.result.judgement.issue}); ` : ""}${response.calls} call${response.calls === 1 ? "" : "s"}${response.guards.length ? `, guards: ${response.guards.join(", ")}` : ""}${response.fallback ? ", template used" : ""}`
              : "n/a"}
          </Row>
          <Row label="Outcome">
            {last && outcome ? `${getItem(last.item).lemma}: ${outcome.kind}${outcome.level !== null ? `, level ${outcome.level}` : ""}${outcome.rating ? `, rating ${outcome.rating}` : ""}` : "none yet"}
          </Row>
          <Row label="Latency">
            {view.latency
              ? `speech-to-text ${ms(view.latency.sttMs)}, turn ${ms(view.latency.turnMs)} (LLM ${ms(view.latency.llmMs)}), first audio ${ms(view.latency.totalMs)} after you finished`
              : "n/a"}
          </Row>
        </dl>
      </Section>

      <Section title="Cost this session">
        <p>
          {usd(cost.total)}: speech-to-text {usd(cost.stt)} ({view.meter.sttSeconds.toFixed(1)} s), LLM {usd(cost.llm)} ({view.meter.inputTokens} in, {view.meter.cachedTokens} cached, {view.meter.outputTokens} out), speech {usd(cost.tts)} ({view.meter.ttsChars} characters)
        </p>
        <details>
          <summary className="cursor-pointer text-teal-800">Prices and sources</summary>
          <ul className="mt-1 list-disc space-y-1 pl-4">
            {Object.values(PRICES).map((p) => (
              <li key={p.unit}>
                ${p.usd} {p.unit}. {p.source}
              </li>
            ))}
          </ul>
        </details>
      </Section>
    </>
  );
}

function ModelTable({ model, clock }: { model: Model; clock: Clock }) {
  const items = Object.values(model.items)
    .filter((it) => isItemId(it.id))
    .sort((a, b) => (a.dueDay < b.dueDay ? -1 : a.dueDay > b.dueDay ? 1 : 0));
  return (
    <Section title="Learner model">
      <p className="text-stone-600">Built by replaying the event log. Opening this during a session can give answers away.</p>
      {items.length === 0 ? (
        <p>No words yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left tabular-nums">
            <thead className="text-stone-600">
              <tr>
                <th className="py-1 pr-2 font-medium">Word</th>
                <th className="pr-2 font-medium">Level</th>
                <th className="pr-2 font-medium">Stability</th>
                <th className="pr-2 font-medium">Difficulty</th>
                <th className="pr-2 font-medium">R now</th>
                <th className="font-medium">Due</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id} className="border-t border-stone-200">
                  <td className="py-1 pr-2">{getItem(it.id).lemma}</td>
                  <td className="pr-2">
                    {it.level} <span className="text-stone-500">{levelLabel(it.level, it.mastered)}</span>
                  </td>
                  <td className="pr-2">{it.card.stability.toFixed(2)}</td>
                  <td className="pr-2">{it.card.difficulty.toFixed(2)}</td>
                  <td className="pr-2">{retrievability(it.card, clock.t).toFixed(2)}</td>
                  <td>{it.dueDay <= clock.day ? "now" : formatDay(it.dueDay)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}
