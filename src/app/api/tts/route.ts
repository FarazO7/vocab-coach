import { DEFAULTS } from "../../../config/defaults";
import { fail, guard, log, readJson } from "../../../server/http";
import { failureCode } from "../../../server/providers/error";
import { synthesize } from "../../../server/providers/tts";
import { TtsRequestSchema } from "../../../server/schemas";

export const runtime = "nodejs";
export const maxDuration = 30;

/** Brief §3: text (max 600 characters) to Aura-2 MP3. On failure the client shows text only (brief §7). */
export async function POST(req: Request): Promise<Response> {
  const t0 = performance.now();
  const end = (res: Response, extra: Record<string, string | number | string[]> = {}) => {
    log("tts", res.status, t0, extra);
    return res;
  };
  const g = guard(req, Date.now());
  if (!g.ok) return end(g.res, { code: g.code });
  if (!g.env.VOICE_ENABLED) return end(fail(503, "voice_disabled"), { code: "voice_disabled" });

  const body = await readJson(req, 8 * 1024);
  if (!body.ok) return end(fail(body.status, body.code), { code: body.code });
  const parsed = TtsRequestSchema.safeParse(body.value);
  if (!parsed.success) return end(fail(400, "bad_request"), { code: "bad_request" });
  const text = parsed.data.text;
  if (text.length > DEFAULTS.ttsMaxChars) return end(fail(413, "text_too_long"), { code: "text_too_long" });

  try {
    const audio = await synthesize(text, g.env);
    return end(new Response(audio, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" } }), { chars: text.length });
  } catch (e) {
    return end(fail(502, "tts_failed"), { code: "tts_failed", cause: failureCode(e) });
  }
}
