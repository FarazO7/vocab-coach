"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useData } from "../../client/hooks";
import { getStore } from "../../client/store";
import { Button, Loading } from "../../components/ui";
import { TOPIC_LABELS, TOPICS, type LearnerLevel, type Profile, type Topic } from "../../engine/types";

const EXAMS: { value: Profile["exam"]; label: string }[] = [
  { value: "IELTS", label: "IELTS" },
  { value: "PTE", label: "PTE" },
  { value: "DET", label: "DET" },
  { value: "other", label: "Other" },
];
const LEVELS: { value: LearnerLevel; label: string }[] = [
  { value: "B1", label: "B1" },
  { value: "B2", label: "B2" },
  { value: "not_sure", label: "Not sure" },
];
const MAX_TOPICS = 3;

/** Brief §8 onboarding: under 30 seconds, everything optional except exam and level (preselected). */
export default function Onboarding() {
  const data = useData();
  if (!data) return <Loading />;
  if (!data.adult) {
    return (
      <p className="pt-4 text-stone-800">
        Please confirm you are 18 or older on the{" "}
        <Link href="/" className="text-teal-800 underline">
          start page
        </Link>{" "}
        first.
      </p>
    );
  }
  return <Form initial={data.profile} />;
}

function Form({ initial }: { initial: Profile | null }) {
  const router = useRouter();
  const [name, setName] = useState(initial?.name ?? "");
  const [exam, setExam] = useState<Profile["exam"]>(initial?.exam ?? "IELTS");
  const [level, setLevel] = useState<LearnerLevel>(initial?.level ?? "not_sure");
  const [topics, setTopics] = useState<Topic[]>(initial?.interests ?? []);
  const [testDate, setTestDate] = useState(initial?.testDate ?? "");

  const toggle = (t: Topic) =>
    setTopics((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : cur.length < MAX_TOPICS ? [...cur, t] : cur));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const profile: Profile = { name: name.trim().slice(0, 40), exam, level, interests: topics, testDate: testDate || null };
    getStore().update((d) => ({ ...d, profile }));
    router.push(initial ? "/" : "/session");
  };

  return (
    <form onSubmit={submit} className="space-y-6 pt-2">
      <h1 className="text-2xl font-semibold text-stone-900">A few quick questions</h1>

      <label className="block space-y-1 text-sm">
        <span className="font-medium text-stone-800">What should I call you? (optional)</span>
        <input
          className="block w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-base"
          value={name}
          maxLength={40}
          autoComplete="given-name"
          onChange={(e) => setName(e.target.value)}
        />
      </label>

      <Choice legend="Which test are you preparing for?" options={EXAMS} value={exam} onChange={setExam} />
      <Choice legend="Your English level, roughly" options={LEVELS} value={level} onChange={setLevel} />

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-stone-800">Topics you like talking about (up to three, optional)</legend>
        <div className="flex flex-wrap gap-2">
          {TOPICS.map((t) => {
            const on = topics.includes(t);
            return (
              <button
                key={t}
                type="button"
                aria-pressed={on}
                disabled={!on && topics.length >= MAX_TOPICS}
                onClick={() => toggle(t)}
                className={`min-h-11 rounded-full border px-3 py-1 text-sm ${
                  on ? "border-teal-700 bg-teal-700 text-white" : "border-stone-300 bg-white text-stone-800 disabled:text-stone-400"
                }`}
              >
                {TOPIC_LABELS[t]}
              </button>
            );
          })}
        </div>
      </fieldset>

      <label className="block space-y-1 text-sm">
        <span className="font-medium text-stone-800">Test date (optional)</span>
        <input
          type="date"
          className="block rounded-lg border border-stone-300 bg-white px-3 py-2 text-base"
          value={testDate}
          onChange={(e) => setTestDate(e.target.value)}
        />
      </label>

      <Button type="submit">{initial ? "Save" : "Continue"}</Button>
    </form>
  );
}

function Choice<T extends string>({
  legend,
  options,
  value,
  onChange,
}: {
  legend: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium text-stone-800">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <label
            key={o.value}
            className={`flex min-h-11 cursor-pointer items-center rounded-full border px-4 text-sm has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-teal-700 ${
              value === o.value ? "border-teal-700 bg-teal-700 text-white" : "border-stone-300 bg-white text-stone-800"
            }`}
          >
            <input type="radio" className="sr-only" name={legend} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
