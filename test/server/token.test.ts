import { describe, expect, it } from "vitest";
import { issueToken, TOKEN_TTL_MS, verifyToken } from "../../src/server/token";

const SECRET = "x".repeat(40);
const NOW = 1_800_000_000_000;

describe("session token (brief §3)", () => {
  it("verifies its own token until 12 minutes have passed", () => {
    const { token, claims } = issueToken(SECRET, NOW);
    expect(verifyToken(token, SECRET, NOW + TOKEN_TTL_MS - 1)).toEqual(claims);
    expect(verifyToken(token, SECRET, NOW + TOKEN_TTL_MS)).toBeNull();
    expect(TOKEN_TTL_MS).toBe(12 * 60_000);
  });

  it("rejects a token signed with another secret or with an edited payload", () => {
    const { token } = issueToken(SECRET, NOW);
    expect(verifyToken(token, "y".repeat(40), NOW)).toBeNull();
    const [payload, sig] = token.split(".");
    const edited = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload!, "base64url").toString()), exp: NOW * 2 })).toString("base64url");
    expect(verifyToken(`${edited}.${sig}`, SECRET, NOW)).toBeNull();
  });

  it.each([null, "", "abc", "a.b.c", "!!!.???"])("rejects malformed input %j", (t) => {
    expect(verifyToken(t, SECRET, NOW)).toBeNull();
  });
});
