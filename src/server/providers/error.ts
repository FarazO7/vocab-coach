/** A provider answered, but not usefully (bad status or shape). `code` is safe to log. */
export class ProviderError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}

/** Maps a provider failure to a loggable code. Anything else is a bug, so it is rethrown. */
export function failureCode(e: unknown): string {
  if (e instanceof ProviderError) return e.code;
  if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) return "timeout";
  if (e instanceof TypeError) return "network"; // fetch's network failure
  throw e;
}
