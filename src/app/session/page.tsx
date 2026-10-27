import { Suspense } from "react";
import { SessionScreen } from "../../components/SessionScreen";
import { Loading } from "../../components/ui";

export default function SessionPage() {
  return (
    <Suspense fallback={<Loading />}>
      <SessionScreen />
    </Suspense>
  );
}
