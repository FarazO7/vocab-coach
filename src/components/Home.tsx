"use client";

import { useClock, useModel } from "../client/hooks";
import { getStore, type Data } from "../client/store";
import { diffDays } from "../engine/days";
import { isItemId } from "../engine/lexicon";
import { dueItems } from "../engine/replay";
import { Card, LinkButton, Loading, Notice } from "./ui";

/** Brief §8 Home, for a returning learner. Progress is counts, never streaks. */
export function Home({ data }: { data: Data }) {
  const model = useModel(data);
  const clock = useClock(data);
  const profile = data.profile;
  if (!model || !clock || !profile) return <Loading />;

  const items = Object.values(model.items).filter((it) => isItemId(it.id));
  const due = dueItems(model, clock.day, clock.t).filter(isItemId);
  const daysToTest = profile.testDate ? diffDays(clock.day, profile.testDate) : null;
  const lastSession = model.sessions.filter((s) => s.closed).at(-1);
  const store = getStore();

  return (
    <div className="space-y-5">
      {store.notice && <Notice tone="warn">{store.notice}</Notice>}
      {store.saveError && <Notice tone="warn">{store.saveError}</Notice>}

      <section className="space-y-1 pt-2">
        <h1 className="text-2xl font-semibold text-stone-900">{profile.name ? `Welcome back, ${profile.name}` : "Welcome back"}</h1>
        {daysToTest !== null && daysToTest >= 0 && (
          <p className="text-stone-700">
            Your {profile.exam === "other" ? "test" : profile.exam} is {daysToTest === 0 ? "today" : `in ${daysToTest} day${daysToTest === 1 ? "" : "s"}`}.
          </p>
        )}
      </section>

      <Card title={due.length ? `${due.length} word${due.length === 1 ? "" : "s"} due` : "Nothing due right now"}>
        {/* A count, never the words: seeing them now would turn the session's recall into recognition (brief §2). */}
        <p className="text-sm text-stone-700">
          {due.length > 0 ? "They will come back in today's conversation." : "A session will introduce new words."}
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <LinkButton href="/session">Start a session</LinkButton>
          <LinkButton href="/notebook" variant="secondary">
            Notebook
          </LinkButton>
        </div>
      </Card>

      <Card title="Your progress">
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <Stat label="Words met" value={items.length} />
          <Stat label="Used on your own" value={items.filter((i) => i.hasL5).length} />
          <Stat label="Still used after 7 days" value={items.filter((i) => i.usedLater).length} />
          <Stat label="Mastered" value={items.filter((i) => i.mastered).length} />
        </dl>
      </Card>

      {lastSession && (
        <p className="text-sm">
          <LinkButton href={`/recap?sid=${encodeURIComponent(lastSession.sid)}`} variant="ghost" className="px-0">
            See your last recap
          </LinkButton>
        </p>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-stone-700">{label}</dt>
      <dd className="text-2xl font-semibold text-stone-900">{value}</dd>
    </div>
  );
}
