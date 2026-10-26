import { fail, json, loadEnv, log, sameOrigin } from "../../../server/http";
import { issueToken } from "../../../server/token";

export const runtime = "nodejs";
export const maxDuration = 30;

/** Brief §3: a signed 12-minute session token plus flags. VOICE_ENABLED=false means text-only mode. */
export async function POST(req: Request): Promise<Response> {
  const t0 = performance.now();
  if (!sameOrigin(req)) {
    log("session", 403, t0, { code: "bad_origin" });
    return fail(403, "bad_origin");
  }
  const env = loadEnv();
  if (!env) {
    log("session", 500, t0, { code: "server_misconfigured" });
    return fail(500, "server_misconfigured");
  }
  const { token, claims } = issueToken(env.SESSION_SECRET, Date.now());
  log("session", 200, t0);
  return json({ token, sid: claims.sid, expiresAt: claims.exp, voiceEnabled: env.VOICE_ENABLED });
}
