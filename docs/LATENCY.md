# Latency pass (M5)

Target (brief §7): from the end of the learner's turn to the first agent audio, p50 at most 2.5 s and p95 at most 4 s.

## Measured, 27 Oct 2026

`npm run eval:latency` against `next start` on a Mac in India, with real providers (Deepgram Nova-3 en-IN, OpenAI `gpt-6-luna` at reasoning `none`, Deepgram Aura-2). 20 turns through the routes the browser uses, mixing CONVERSE, ELICIT, HINT, JUDGE and SEED, each starting from the same 5-second speech clip.

| Stage | p50 | p95 |
|---|---|---|
| Speech-to-text (`/api/stt`) | 1.54 s | 3.81 s |
| `/api/turn` (almost all of it the LLM) | 2.42 s | 4.53 s |
| TTS first audio byte (`/api/tts`) | 1.17 s | 2.22 s |
| **Total, end of turn to first audio** | **5.19 s** | **9.57 s** |

The LLM alone, 10 runs each, same prompt:

| | p50 | p95 |
|---|---|---|
| Plain request (today) | 1.78 s | 3.07 s |
| Streamed: first token | 1.03 s | 1.58 s |
| Streamed: reply text complete | 1.31 s | 1.88 s |
| Streamed: done | 1.56 s | 3.13 s |

Connection set-up from this Mac:

| Host | TCP connect | TLS done | First byte |
|---|---|---|---|
| api.openai.com (Cloudflare edge, near) | 0.04 s | 0.09 s | 0.13 to 0.41 s |
| api.deepgram.com (US) | 0.32 to 0.55 s | 0.75 to 1.07 s | 1.03 to 1.46 s |

In the app itself (built-in browser, typing mode) one turn reached first audio in about 4.1 s.

## What it means

1. **Distance to Deepgram dominates speech-to-text and TTS from India.** A fresh connection to Deepgram costs about a second before any work starts, and both speech calls pay it. OpenAI is served from a nearby edge, so its time is mostly the model.
2. **The LLM's own time is about 1.8 s.** Streaming would let speech start once the reply text is complete (1.3 s), without waiting for the judgement and other fields.
3. **The target is not met as built**, and no single setting fixes it.

## Recommendation

1. **Deploy to Vercel's default region, `iad1` (US East),** pinned in `vercel.json`. Functions there sit next to Deepgram and OpenAI's US origins, so the slow hop above becomes a short one; the learner pays one trip from their nearest Vercel edge to the US per request instead. Estimate (not measured): about 3.4 s p50 from India. `bom1` (Mumbai) would make the browser hop short but keep every Deepgram call long, so it is the worse trade for this app.
2. **Then measure the deployed app** with `LATENCY_BASE=https://<your-app>.vercel.app npm run eval:latency`.
3. **If p50 is still above 2.5 s, approve C1 in `CHANGES.md`** (stream the reply into TTS). Estimated saving: about 0.5 s at p50 and 1.2 s at p95, from the LLM measurements above.
4. **Hold C2 (streaming speech-to-text) unless C1 isn't enough.** It is the largest remaining saving but a bigger change to the brief's architecture.

The filler phrase (should-have) already covers the wait when a reply takes over 2.5 s; the latency log measures the real reply, not the filler.
