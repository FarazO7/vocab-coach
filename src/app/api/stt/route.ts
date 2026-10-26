import { DEFAULTS } from "../../../config/defaults";
import { fail, guard, json, log, readBytes } from "../../../server/http";
import { failureCode } from "../../../server/providers/error";
import { transcribe, type SttResult } from "../../../server/providers/stt";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_BYTES = 2 * 1024 * 1024; // brief §3
const AUDIO_TYPES = /^audio\/(webm|mp4)(;|$)/; // brief §7 MediaRecorder types, passed through

/** Brief §3 and §7: audio in, transcript with per-word confidence out. Retries the provider once. */
export async function POST(req: Request): Promise<Response> {
  const t0 = performance.now();
  const end = (res: Response, extra: Record<string, string | number | string[]> = {}) => {
    log("stt", res.status, t0, extra);
    return res;
  };
  const g = guard(req, Date.now());
  if (!g.ok) return end(g.res, { code: g.code });
  if (!g.env.VOICE_ENABLED) return end(fail(503, "voice_disabled"), { code: "voice_disabled" });

  const type = req.headers.get("content-type") ?? "";
  if (!AUDIO_TYPES.test(type)) return end(fail(415, "bad_audio_type"), { code: "bad_audio_type" });
  const body = await readBytes(req, MAX_BYTES);
  if (!body.ok) return end(fail(body.status, body.code), { code: body.code });
  if (body.value.byteLength < 100) return end(fail(400, "empty_audio"), { code: "empty_audio" });

  const codes: string[] = [];
  let out: SttResult | null = null;
  for (let attempt = 0; attempt < 2 && !out; attempt++) {
    try {
      out = await transcribe(body.value, type, g.env);
    } catch (e) {
      codes.push(failureCode(e));
    }
  }
  if (!out) return end(fail(502, "stt_failed"), { code: "stt_failed", causes: codes });
  if (out.durationS > DEFAULTS.maxRecordingS + 0.5) return end(fail(413, "audio_too_long"), { code: "audio_too_long" });

  const ms = Math.round(performance.now() - t0);
  return end(json({ ...out, ms }), { audioS: Math.round(out.durationS * 10) / 10, retries: codes.length });
}
