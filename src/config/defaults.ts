// Brief §14 values plus the approved PLAN decisions (D1, D2, D5, D6, D7). One place, so nothing drifts.
export const DEFAULTS = {
  seedsFirstSession: 2,
  seedsLater: 3,
  noSeedsWhenDueOver: 8,
  maxDuePerSession: 6,
  stretchMinS: 120,
  stretchForceS: 240,
  stretchMinLearnerTurns: 2,
  seedMinLearnerTurnsApart: 2,
  noSeedInLastS: 150, // D1
  hintsBeforeReveal: 3,
  asrConfFloor: 0.6,
  judgeConfFloor: 0.6,
  deferredNotesPerSession: 2,
  replyWordCap: 40,
  recapWordCap: 80,
  firstSessionS: 360,
  laterSessionS: 600,
  hardCapS: 600,
  desiredRetention: 0.9,
  maxRecordingS: 45,
  fragmentMaxTokens: 3, // D2
  echoAgentTurns: 2, // D5
  leakStemLetters: 5, // D7
  leakStemMinLemma: 6, // D7
  maxLlmCallsPerTurn: 2, // D6
  llmTimeoutMs: 6000,
  historyTurns: 8,
  ttsMaxChars: 600,
  masteryMinDays: 7,
  fillerAfterMs: 2500, // should-have: a cached filler phrase when a reply takes over 2.5 s
} as const;
