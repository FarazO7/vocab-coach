# Proposed changes

Changes to approved rules, numbers, architecture or content wait here for sign-off (brief §0 rule 4). Nothing below is implemented.

## C1. Stream the reply into TTS (proposed, 27 Oct 2026)

**Why.** The LLM step is the largest part of each turn. Measured from this Mac (`docs/LATENCY.md`): a plain request takes 1.78 s at p50 and 3.07 s at p95, but with streaming the reply text is complete at 1.31 s and 1.88 s. The judgement and other fields that follow aren't needed to start speaking.

**What changes.**
- `/api/turn` streams NDJSON instead of returning one JSON body. As soon as the `reply` string is complete and passes the leak guard and word cap, it sends `{"type":"reply","reply":"..."}`; it finishes with the full `TurnResponse` as today.
- The client starts TTS on the early reply and applies the `TurnResult` to the engine when the final line arrives, before the next learner turn.
- If the early reply fails a guard, no early line is sent and the turn behaves exactly as now (regenerate once, then template).

**What doesn't change.** The engine, the prompt, D6's two-call budget, every guard, zod validation of the final result, and the TTS route.

**Brief sections touched.** §3 (the response shape of `/api/turn`).

**Expected effect.** About 0.5 s off p50 and 1.2 s off p95 (LLM-only measurement; to be confirmed on the deployed app).

**Risk.** More code in `/api/turn` and the controller; partial-JSON parsing of the first field. Covered by route and controller tests.

## C2. Stream speech-to-text while the learner talks (proposed, 27 Oct 2026; recommend holding)

**Why.** Speech-to-text is 1.54 s at p50 and 3.81 s at p95 from India, because the whole clip uploads after the tap and is transcribed in one batch. A live connection transcribes during speech, so the final transcript is ready shortly after the tap (estimate: about 0.3 s).

**What changes.** Brief §3 and §7 specify Deepgram pre-recorded via `/api/stt`. This would stream audio from the browser to Deepgram's live endpoint (Nova-3, en-IN, punctuation and smart formatting, no keyterms, MIP opt-out, per-word confidence all kept), authorised by a short-lived Deepgram token minted by `/api/session` so the API key stays server-side. `/api/stt` stays as the fallback.

**Expected effect.** About 1 s off p50 from India; less from a US-hosted deployment.

**Risk.** The biggest change since Phase 0: WebSockets, recorder timeslices, iOS Safari behaviour, a new token flow to verify against Deepgram's current docs, and new failure modes. Recommend deciding only after C1 and a measured deployment.
