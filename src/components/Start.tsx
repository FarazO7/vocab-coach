"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { getStore } from "../client/store";
import { dayOf } from "../engine/days";
import { demoEvents, demoProfile } from "../engine/demo";
import { Button, Card } from "./ui";

/** Brief §8 Start screen, for a first-time visitor. */
export function Start() {
  const router = useRouter();
  const [adult, setAdult] = useState(false);

  const begin = () => {
    getStore().update((d) => ({ ...d, adult: true }));
    router.push("/onboarding");
  };

  // Brief §9: demo history comes from scripted events replayed through the engine.
  const loadDemo = () => {
    const now = Date.now();
    const tz = new Date(now).getTimezoneOffset();
    getStore().update((d) => ({ ...d, adult: true, profile: demoProfile(dayOf(now, tz)), events: demoEvents(now, tz) }));
  };

  return (
    <div className="space-y-6">
      <section className="space-y-2 pt-2">
        <h1 className="text-2xl font-semibold leading-tight text-stone-900">Turn words you half-know into words you actually say.</h1>
        <p className="text-stone-700">Short voice conversations for IELTS, PTE and DET speaking practice.</p>
      </section>

      <Card title="How it works">
        <ol className="list-decimal space-y-2 pl-5 text-sm text-stone-800">
          <li>
            <strong>Meet a word.</strong> The coach uses it in conversation, and you make your own sentence with it.
          </li>
          <li>
            <strong>Stretch.</strong> A few minutes later, a question needs that word. You get hints if you are stuck.
          </li>
          <li>
            <strong>Spiral.</strong> On later days, words come back when they are due for review, in a new context.
          </li>
        </ol>
      </Card>

      <div className="space-y-1 text-sm text-stone-700">
        <p>You will be talking to an AI, and its voice is computer-generated.</p>
        <p>Audio isn&apos;t stored. Your progress stays in this browser.</p>
      </div>

      <label className="flex items-center gap-3 text-sm text-stone-900">
        <input type="checkbox" className="h-5 w-5 accent-teal-700" checked={adult} onChange={(e) => setAdult(e.target.checked)} />
        I am 18 or older.
      </label>

      <div className="flex flex-wrap gap-3">
        <Button onClick={begin} disabled={!adult}>
          Start
        </Button>
        <Button variant="secondary" onClick={loadDemo} disabled={!adult}>
          Try with demo history
        </Button>
      </div>

      <details className="text-sm text-stone-700">
        <summary className="cursor-pointer text-teal-800">Reviewing this prototype?</summary>
        <ol className="mt-2 list-decimal space-y-1 pl-5">
          <li>Tick the box and choose Try with demo history.</li>
          <li>Start a session and say &quot;I don&apos;t know&quot; (or tap the button) to see the hint ladder.</li>
          <li>Open Under the hood and fast-forward 3 days to watch words come due.</li>
        </ol>
      </details>
    </div>
  );
}
