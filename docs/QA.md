# QA record (M5, 27 Oct 2026)

Checked against the brief's Definition of Done (§13) on the production build (`next build && next start`) with real providers, from a Mac in India. "Live" means done in the app in a browser; "tests" means automated (`npm test`, 400+ tests).

## Definition of Done

| # | Item | How it was checked | Status |
|---|---|---|---|
| 1 | Fresh visitor: onboarding, a ~6-minute voice session with 2 seeds and a Stretch for each, spoken recap, both words in the notebook | Live in typing mode: first session, 2 seeds (0:24 and 1:00), Stretches at 2:43 and 3:13, recap at the 6-minute budget, both words in the notebook with their sentences. Voice capture not run (see devices) | Typing: pass. Voice: needs a real device |
| 2 | "I don't know" steps through hints 1, 2, 3, then reveal; target never shown early | Live (M3) with the real model, plus tests on every fallback line and the chip | Pass |
| 3 | After +1 or +3 days, due words return first in a new context; level, FSRS and due date change as §5 says | Live (M4): +3 days brought all 6 demo words due; a Practise now success moved stability 6.57 to 26.87 and earned the star; reset rebuilt the model. Rules covered by replay tests | Pass |
| 4 | A low-confidence target triggers one CLARIFY, then UNCERTAIN, with no change | Tests (engine and transcript replay). Needs voice to see live | Pass in tests; live needs a device |
| 5 | "prepone" is never corrected | Live: "We preponed our team meeting" got no correction, and the recap offered "bring forward" as another way to say it. Guard and replay test | Pass |
| 6 | Replies stay within the word cap | Guard with regenerate-then-cut, tests; every live reply was under 40 words | Pass |
| 7 | Median tap-release to first audio at most 2.5 s | Measured p50 5.2 s, p95 9.6 s from India against a local server (`docs/LATENCY.md`) | Fail as measured; see the recommendation and `CHANGES.md` C1 |
| 8 | Text mode works end to end without a microphone | Live: the browser blocked the mic, the session switched to typing with a one-line reason, and a full session ran | Pass |
| 9 | No secrets in the client bundle; nothing personal stored server-side | Build fails on any secret value in client output (ran clean with the real keys); server logs hold codes and timings only (test asserts it) | Pass |
| 10 | Replaying the event log rebuilds the same model; export and delete-all work | Replay tests (shuffled, duplicated, JSON round trip); store tests for export (with backups and reports) and delete-all. Not clicked live (download and confirm dialogs) | Pass in tests |
| 11 | README covers setup, env vars, architecture, decisions, research versus defaults, limitations, "try it in 3 minutes" | `README.md` | Pass |

## Devices

| Device | What was checked | Result |
|---|---|---|
| Chrome desktop (Chromium, the app's built-in browser) | Every screen at desktop width and 375 px; typing sessions end to end; streaming TTS playback (MediaSource); mic-blocked fallback; demo history; clock controls | Pass. Voice capture couldn't be tested: the pane blocks the microphone |
| Safari on macOS | Not run | Needs you, or I can drive Safari on this Mac if you allow computer use |
| Safari on iOS | Not run: the iOS Simulator needs full Xcode (`sudo xcode-select -s /Applications/Xcode.app/Contents/Developer` after installing it) | Needs your iPhone |
| Chrome on Android | Not run | Needs your phone |

Found and fixed during M5: the model sometimes wrapped words in Markdown (`**Demanding**`), which showed as raw asterisks in captions and could be read aloud. Replies and notes now go through `stripMarkdown` before any other guard.

## Five-minute device script

For each of Safari macOS, an iPhone and an Android phone, on the deployed URL:

1. Open the link. Tick 18+, choose **Try with demo history**.
2. **Start a session**, choose **Start with voice**, allow the microphone. Check the agent's first line plays and its caption shows.
3. Tap the circle, say a sentence, tap again. Check your words appear under "What I heard from you" and the agent replies.
4. While the agent is speaking, tap the circle. Playback should stop at once and recording start (barge-in).
5. Tap **I don't know** four times: hint 1, the first sound, two options, then the word. The chip should never show the word before the options.
6. Tap **Repeat slower**: the last reply plays again, slower.
7. Desktop only: hold **Space** to talk, release to send.
8. iPhone only: lock the phone during a reply, unlock, and carry on. Note anything stuck.
9. Tap **End**, listen to the recap, open the **Notebook**.
10. Open the link inside WhatsApp's in-app browser. It should either say "Open in Chrome or Safari for voice. Text mode works here." or, if the in-app browser offers a microphone that then fails, start in typing with a one-line reason. Typing should work either way.

Note the device, browser version, and anything that didn't behave as described.
