"use client";

import { useState } from "react";
import { useClock, useData, useModel } from "../../client/hooks";
import { dueLabel, levelLabel } from "../../client/labels";
import { Badge, Card, LinkButton, Loading } from "../../components/ui";
import { getItem, isItemId, lexiconIndex } from "../../engine/lexicon";
import { dueItems } from "../../engine/replay";

type Filter = "due" | "learning" | "mastered";
const FILTERS: { value: Filter; label: string }[] = [
  { value: "due", label: "Due" },
  { value: "learning", label: "Learning" },
  { value: "mastered", label: "Mastered" },
];

/** Brief §8 notebook: filters, and per word its meaning, collocation, best sentence, level and next due date. */
export default function Notebook() {
  const data = useData();
  const model = useModel(data);
  const clock = useClock(data);
  const [filter, setFilter] = useState<Filter>("learning");
  if (!data || !model || !clock) return <Loading />;

  const due = new Set(dueItems(model, clock.day, clock.t));
  const items = Object.values(model.items)
    .filter((it) => isItemId(it.id))
    .filter((it) => (filter === "due" ? due.has(it.id) : filter === "mastered" ? it.mastered : !it.mastered))
    .sort((a, b) => lexiconIndex(a.id) - lexiconIndex(b.id));

  return (
    <div className="space-y-4 pt-2">
      <h1 className="text-2xl font-semibold text-stone-900">Notebook</h1>
      <div role="group" aria-label="Filter words" className="flex gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            aria-pressed={filter === f.value}
            onClick={() => setFilter(f.value)}
            className={`min-h-11 rounded-full border px-4 text-sm ${
              filter === f.value ? "border-teal-700 bg-teal-700 text-white" : "border-stone-300 bg-white text-stone-800"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {items.length === 0 && <p className="text-sm text-stone-700">No words here yet.</p>}

      {items.map((it) => {
        const lex = getItem(it.id);
        return (
          <Card key={it.id}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-semibold text-stone-900">{lex.lemma}</h2>
              <Badge>{levelLabel(it.level, it.mastered)}</Badge>
            </div>
            <p className="text-sm text-stone-800">
              <span className="text-stone-600">{lex.pos}.</span> {lex.definition_simple}
            </p>
            <p className="mt-1 text-sm text-stone-800">
              <span className="text-stone-600">Say:</span> {lex.collocations[0]}
            </p>
            {it.bestSentence && (
              <p className="mt-1 text-sm italic text-stone-800">&ldquo;{it.bestSentence.text}&rdquo;</p>
            )}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm text-stone-700">{dueLabel(it.dueDay, clock.day)}</span>
              <LinkButton href={`/session?practise=${encodeURIComponent(it.id)}`} variant="secondary">
                Practise now
              </LinkButton>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
