export const TOPICS = [
  "work_study",
  "city_transport",
  "environment",
  "technology",
  "health_lifestyle",
  "education",
  "travel",
] as const;
export type Topic = (typeof TOPICS)[number];

export const TOPIC_LABELS: Record<Topic, string> = {
  work_study: "work and study",
  city_transport: "city life and transport",
  environment: "the environment",
  technology: "technology",
  health_lifestyle: "health and lifestyle",
  education: "education",
  travel: "travel",
};

export const CEFR = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
export type Cefr = (typeof CEFR)[number];
export type LearnerLevel = "B1" | "B2" | "not_sure";

export type ItemId = string;
export type Day = string; // local calendar date, YYYY-MM-DD
export type Rating = "Again" | "Hard" | "Good" | "Easy";

/** The UI's clock reading for one engine call: ms (real time plus demo offset) and the local day. */
export interface Clock {
  t: number;
  day: Day;
}

export interface Token {
  w: string;
  conf: number;
}

export interface LearnerTurn {
  tokens: Token[];
  text: string;
  modality: "voice" | "text";
  button?: "dont_know";
}

export type DirectiveType = "CONVERSE" | "SEED" | "ELICIT" | "HINT" | "REVEAL" | "CLARIFY" | "JUDGE" | "RECAP";

export interface Directive {
  type: DirectiveType;
  item_id: ItemId | null;
  hint_level: 0 | 1 | 2 | 3;
  repair_allowed: boolean;
}

export interface Judgement {
  appropriate: boolean;
  confidence: number;
  issue: "none" | "meaning" | "collocation" | "form" | "mention_not_use";
}

export interface TurnResult {
  reply: string;
  judgement: Judgement | null;
  spontaneous: { item_id: ItemId; appropriate: boolean; confidence: number }[];
  deferred_note: { said: string; suggest: string } | null;
  learner_state: "ok" | "frustrated" | "wants_to_end";
}

export interface Profile {
  name: string;
  exam: "IELTS" | "PTE" | "DET" | "other";
  level: LearnerLevel;
  interests: Topic[];
  testDate: Day | null;
}

interface EvBase {
  key: string; // session:turn:n
  sid: string;
  t: number;
  day: Day;
}

export interface AttemptEv extends EvBase {
  k: "attempt";
  item: ItemId;
  mode: "seed" | "elicit" | "spontaneous";
  hints: 0 | 1 | 2 | 3;
  revealed: boolean;
  repaired: boolean;
  fragment: boolean;
  targetUsed: boolean; // false when the learner never said the word (I5, I6, I7, D3)
  uncertain: boolean;
  abandoned: boolean;
  asrMin: number;
  modality: "voice" | "text";
  judge: Judgement | null;
  utterance: string;
}

export type Ev =
  | (EvBase & { k: "session_start"; topic: Topic; budgetS: number; plan: { due: ItemId[]; seeds: ItemId[] } })
  | (EvBase & { k: "seed"; item: ItemId })
  | AttemptEv
  | (EvBase & { k: "note"; said: string; suggest: string })
  | (EvBase & { k: "dialect"; entry: string })
  | (EvBase & { k: "report"; caption: string })
  | (EvBase & { k: "session_end" });
