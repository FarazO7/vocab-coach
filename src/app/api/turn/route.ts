import { fail, guard, json, log, readJson } from "../../../server/http";
import { openAiLlm } from "../../../server/providers/llm";
import { TurnRequestSchema } from "../../../server/schemas";
import { runTurn } from "../../../server/turn";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_BYTES = 64 * 1024;

/** Brief §3: typed fields in; the server builds the prompt, calls the LLM, validates and guards the reply. */
export async function POST(req: Request): Promise<Response> {
  const t0 = performance.now();
  const g = guard(req, Date.now());
  if (!g.ok) {
    log("turn", g.res.status, t0, { code: g.code });
    return g.res;
  }
  const body = await readJson(req, MAX_BYTES);
  if (!body.ok) {
    log("turn", body.status, t0, { code: body.code });
    return fail(body.status, body.code);
  }
  const parsed = TurnRequestSchema.safeParse(body.value);
  if (!parsed.success) {
    log("turn", 400, t0, { code: "bad_request", paths: parsed.error.issues.map((i) => i.path.join(".")) });
    return fail(400, "bad_request");
  }
  const out = await runTurn(parsed.data, g.claims.sid, openAiLlm(g.env));
  log("turn", 200, t0, { directive: parsed.data.directive.type, calls: out.calls, llmMs: out.llmMs, guards: out.guards });
  return json(out);
}
