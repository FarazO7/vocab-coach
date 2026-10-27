"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useData } from "../../client/hooks";
import { getStore, type Rate } from "../../client/store";
import { Button, Card, Loading } from "../../components/ui";

const RATES: Rate[] = [0.8, 1, 1.2];

/** Brief §8 settings: speech rate, export JSON, delete all. */
export default function Settings() {
  const data = useData();
  const router = useRouter();
  if (!data) return <Loading />;
  const store = getStore();

  const exportJson = () => {
    const url = URL.createObjectURL(new Blob([store.exportJson()], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `vocab-coach-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const deleteAll = () => {
    if (!window.confirm("Delete all your progress in this browser? This can't be undone.")) return;
    store.deleteAll();
    router.push("/");
  };

  return (
    <div className="space-y-4 pt-2">
      <h1 className="text-2xl font-semibold text-stone-900">Settings</h1>

      <Card title="Speech rate">
        <div role="radiogroup" aria-label="Speech rate" className="flex gap-2">
          {RATES.map((r) => (
            <button
              key={r}
              type="button"
              role="radio"
              aria-checked={data.rate === r}
              onClick={() => store.update((d) => ({ ...d, rate: r }))}
              className={`min-h-11 rounded-full border px-4 text-sm ${
                data.rate === r ? "border-teal-700 bg-teal-700 text-white" : "border-stone-300 bg-white text-stone-800"
              }`}
            >
              {r}×
            </button>
          ))}
        </div>
      </Card>

      {data.profile && (
        <Card title="Your details">
          <Link href="/onboarding" className="text-sm text-teal-800 underline">
            Change your name, test, level or topics
          </Link>
        </Card>
      )}

      <Card title="Your data">
        <p className="mb-3 text-sm text-stone-700">Everything is stored in this browser only. Export includes your word history and any corrections you reported.</p>
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" onClick={exportJson}>
            Export JSON
          </Button>
          <Button variant="danger" onClick={deleteAll}>
            Delete all
          </Button>
        </div>
      </Card>
    </div>
  );
}
