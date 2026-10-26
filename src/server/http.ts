import { EnvError, getEnv, type Env } from "./env";
import { verifyToken, type SessionClaims } from "./token";

export const json = (body: unknown, status = 200): Response =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export const fail = (status: number, code: string): Response => json({ error: code }, status);

/** Server logs hold route, status, latency and error codes only: never audio, transcripts or replies (brief §10). */
export function log(route: string, status: number, startedAt: number, extra: Record<string, string | number | string[]> = {}): void {
  console.info(JSON.stringify({ route, status, ms: Math.round(performance.now() - startedAt), ...extra }));
}

/** D11 same-origin check: browsers send Origin on every POST, including same-origin fetches. */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  return origin !== null && origin === new URL(req.url).origin;
}

export function loadEnv(): Env | null {
  try {
    return getEnv();
  } catch (e) {
    if (!(e instanceof EnvError)) throw e;
    console.error(e.message); // names of the bad variables only
    return null;
  }
}

type Guarded = { ok: true; env: Env; claims: SessionClaims } | { ok: false; res: Response; code: string };

/** Every route except /api/session: same origin, valid env, valid unexpired session token. */
export function guard(req: Request, now: number): Guarded {
  if (!sameOrigin(req)) return { ok: false, res: fail(403, "bad_origin"), code: "bad_origin" };
  const env = loadEnv();
  if (!env) return { ok: false, res: fail(500, "server_misconfigured"), code: "server_misconfigured" };
  const auth = req.headers.get("authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  const claims = verifyToken(token, env.SESSION_SECRET, now);
  if (!claims) return { ok: false, res: fail(401, "bad_token"), code: "bad_token" };
  return { ok: true, env, claims };
}

type Body<T> = { ok: true; value: T } | { ok: false; status: number; code: string };

/** Reads at most maxBytes; rejects early on a declared Content-Length over the cap. */
export async function readBytes(req: Request, maxBytes: number): Promise<Body<ArrayBuffer>> {
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (declared > maxBytes) return { ok: false, status: 413, code: "too_large" };
  const buf = await req.arrayBuffer();
  if (buf.byteLength > maxBytes) return { ok: false, status: 413, code: "too_large" };
  return { ok: true, value: buf };
}

export async function readJson(req: Request, maxBytes: number): Promise<Body<unknown>> {
  const bytes = await readBytes(req, maxBytes);
  if (!bytes.ok) return bytes;
  try {
    return { ok: true, value: JSON.parse(new TextDecoder().decode(bytes.value)) };
  } catch {
    return { ok: false, status: 400, code: "bad_json" };
  }
}
