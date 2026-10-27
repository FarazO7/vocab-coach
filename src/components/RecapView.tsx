"use client";

import { useClock, useData, useModel } from "../client/hooks";
import { dueLabel, levelLabel } from "../client/labels";
import { buildSummary } from "../engine/summary";
import { Badge, Card, Loading } from "./ui";

/** Brief §8 recap: the spoken recap plus cards built from the finalised session. */
export function RecapView({ sid, recapText }: { sid: string; recapText?: string | null }) {
  const data = useData();
  const model = useModel(data);
  const clock = useClock(data);
  if (!data || !model || !clock) return <Loading />;

  const s = buildSummary(data.events, sid, model, clock.day);
  const item = (id: string) => model.items[id];

  return (
    <div className="space-y-4">
      {recapText && (
        <Card title="Recap">
          <p className="text-stone-900">{recapText}</p>
        </Card>
      )}

      {s.learned.length > 0 && (
        <Card title="Words you learned">
          <ul className="space-y-2">
            {s.learned.map((w) => (
              <li key={w.item} className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-stone-900">{w.lemma}</span>
                <Badge>{levelLabel(w.level, item(w.item)?.mastered)}</Badge>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {s.hinted.length > 0 && (
        <Card title="Needed a hint">
          <ul className="space-y-1 text-sm">
            {s.hinted.map((w) => (
              <li key={w.item}>
                <span className="font-medium text-stone-900">{w.lemma}</span>{" "}
                <span className="text-stone-700">comes back {dueLabel(w.nextDue, clock.day).replace("due ", "")}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {s.spontaneous.length > 0 && (
        <Card title="Used on your own">
          <p className="text-sm text-stone-900">{s.spontaneous.map((w) => w.lemma).join(", ")}</p>
        </Card>
      )}

      {s.polish.length > 0 && (
        <Card title="To polish">
          <ul className="space-y-1 text-sm">
            {s.polish.map((p) => (
              <li key={p.said}>
                You said &ldquo;{p.said}&rdquo;. Try &ldquo;{p.suggest}&rdquo;.
              </li>
            ))}
          </ul>
        </Card>
      )}

      {s.alternatives.length > 0 && (
        <Card title="Another way to say it">
          <ul className="space-y-1 text-sm text-stone-800">
            {s.alternatives.map((a) => (
              <li key={a.phrase}>
                &ldquo;{a.phrase}&rdquo; is fine. Some international listeners say &ldquo;{a.international}&rdquo;.
              </li>
            ))}
          </ul>
        </Card>
      )}

      {s.uncertain.length > 0 && (
        <Card title="Couldn't hear clearly">
          <p className="text-sm text-stone-800">
            {s.uncertain.map((w) => w.lemma).join(", ")}. That&apos;s on me, not you, so nothing changed for {s.uncertain.length === 1 ? "this word" : "these words"}.
          </p>
        </Card>
      )}

      <Card>
        <p className="text-sm text-stone-900">
          <strong>{s.dueTomorrow}</strong> {s.dueTomorrow === 1 ? "word is" : "words are"} due by tomorrow.
        </p>
      </Card>
    </div>
  );
}
