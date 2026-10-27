import type { TurnRequest } from "../server/schemas";
import type { TurnResponse } from "../server/turn";

export interface SessionInfo {
  token: string;
  sid: string;
  expiresAt: number;
  voiceEnabled: boolean;
}

export interface SttOut {
  transcript: string;
  words: { w: string; conf: number; start: number; end: number }[];
  durationS: number;
  ms: number;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
  ) {
    super(code);
  }
}

export interface Api {
  session(): Promise<SessionInfo>;
  stt(audio: Blob): Promise<SttOut>;
  turn(body: TurnRequest): Promise<TurnResponse>;
  tts(text: string): Promise<Response>;
}

async function errorCode(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: string };
    return body.error ?? `http_${res.status}`;
  } catch {
    return `http_${res.status}`;
  }
}

/** Talks to our four routes. Refreshes the session token when it is about to expire, or once on a 401. */
export function createApi(fetchImpl: typeof fetch = (...a) => fetch(...a)): Api {
  let current: SessionInfo | null = null;

  async function session(): Promise<SessionInfo> {
    const res = await fetchImpl("/api/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    if (!res.ok) throw new ApiError(res.status, await errorCode(res));
    current = (await res.json()) as SessionInfo;
    return current;
  }

  async function authed(path: string, init: RequestInit): Promise<Response> {
    if (!current || current.expiresAt - Date.now() < 30_000) await session();
    const send = () =>
      fetchImpl(path, { ...init, headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${current?.token ?? ""}` } });
    let res = await send();
    if (res.status === 401) {
      await session();
      res = await send();
    }
    if (!res.ok) throw new ApiError(res.status, await errorCode(res));
    return res;
  }

  return {
    session,
    stt: async (audio) =>
      (await (await authed("/api/stt", { method: "POST", headers: { "Content-Type": audio.type }, body: audio })).json()) as SttOut,
    turn: async (body) =>
      (await (await authed("/api/turn", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })).json()) as TurnResponse,
    tts: (text) => authed("/api/tts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) }),
  };
}
