"use client";

import { useData } from "../client/hooks";
import { Home } from "../components/Home";
import { Start } from "../components/Start";
import { Loading } from "../components/ui";

export default function Page() {
  const data = useData();
  if (!data) return <Loading />;
  return data.profile ? <Home data={data} /> : <Start />;
}
