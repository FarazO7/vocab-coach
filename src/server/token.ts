import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const TOKEN_TTL_MS = 12 * 60_000; // brief §3; the client hard-stops at 10 minutes (I12)

const ClaimsSchema = z.object({ sid: z.string().uuid(), iat: z.number(), exp: z.number() }).strict();
export type SessionClaims = z.infer<typeof ClaimsSchema>;

const sign = (payload: string, secret: string) => createHmac("sha256", secret).update(payload).digest("base64url");

export function issueToken(secret: string, now: number, sid: string = randomUUID()): { token: string; claims: SessionClaims } {
  const claims: SessionClaims = { sid, iat: now, exp: now + TOKEN_TTL_MS };
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return { token: `${payload}.${sign(payload, secret)}`, claims };
}

function decode(payload: string): unknown {
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null; // a malformed payload is just an invalid token; the caller answers 401
  }
}

/** Returns the claims for a valid, unexpired token signed with `secret`, otherwise null. */
export function verifyToken(token: string | null, secret: string, now: number): SessionClaims | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payload = "", sig = ""] = parts;
  const expected = Buffer.from(sign(payload, secret));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  const claims = ClaimsSchema.safeParse(decode(payload));
  if (!claims.success || now >= claims.data.exp) return null;
  return claims.data;
}
