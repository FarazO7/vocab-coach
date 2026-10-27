import type { SessionController } from "./controller";

// The session screen registers its controller here so Under the hood (rendered in the layout) can read it.
let active: SessionController | null = null;
const listeners = new Set<() => void>();

export function setActive(c: SessionController | null): void {
  active = c;
  for (const l of listeners) l();
}

export const getActive = (): SessionController | null => active;

export function subscribeActive(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
