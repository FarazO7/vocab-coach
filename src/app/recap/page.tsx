"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useData } from "../../client/hooks";
import { RecapView } from "../../components/RecapView";
import { LinkButton, Loading } from "../../components/ui";

function Recap() {
  const data = useData();
  const params = useSearchParams();
  if (!data) return <Loading />;
  const closed = data.events.flatMap((e) => (e.k === "session_end" ? [e.sid] : []));
  const sid = params.get("sid") ?? closed.at(-1);
  if (!sid || !closed.includes(sid)) {
    return <p className="pt-4 text-stone-800">No finished session to show yet.</p>;
  }
  return (
    <div className="space-y-4 pt-2">
      <h1 className="text-2xl font-semibold text-stone-900">Session recap</h1>
      <RecapView sid={sid} />
      <LinkButton href="/" variant="secondary">
        Home
      </LinkButton>
    </div>
  );
}

export default function RecapPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Recap />
    </Suspense>
  );
}
