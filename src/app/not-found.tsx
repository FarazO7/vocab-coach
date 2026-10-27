import { LinkButton } from "../components/ui";

export default function NotFound() {
  return (
    <div className="space-y-4 pt-4">
      <h1 className="text-2xl font-semibold text-stone-900">Page not found</h1>
      <p className="text-stone-700">That page doesn&apos;t exist.</p>
      <LinkButton href="/">Home</LinkButton>
    </div>
  );
}
