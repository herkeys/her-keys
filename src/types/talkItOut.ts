import type { ConfidenceLevel } from './onboarding';

export type TalkItOutSpeaker = 'user' | 'herkeys';

/**
 * Observation, hypothesis and conclusion are separate stages on purpose —
 * the UI labels them differently so the user can always tell a theory from a
 * finding (HER_KEYS_PRODUCT.md section 5).
 */
export type TalkItOutStage =
  | 'listen'
  | 'hypothesis'
  | 'refinement'
  | 'clarify'
  | 'result'
  | 'next-step'
  | 'unmatched';

export interface TalkItOutMessage {
  id: string;
  speaker: TalkItOutSpeaker;
  text: string;
  stage?: TalkItOutStage;
  /** Shown as a confidence chip on a result, e.g. "Likely pattern". */
  confidenceLabel?: string;
  /** What this conclusion was built from, shown under the result. */
  evidence?: string[];
}

/** Where the discovery loop currently sits. */
export type DiscoveryStage = 'listening' | 'clarifying' | 'refining' | 'resolved';

export interface ClarificationOption {
  id: string;
  label: string;
  /** Free text matches when every word of a keyword phrase is present. */
  keywords: string[];
  /** How this answer reads back in the evidence trail; defaults to `label`. */
  evidenceLabel?: string;
}

export interface ClarificationQuestion {
  id: string;
  text: string;
  options: ClarificationOption[];
}

export interface EvidenceItem {
  questionId: string;
  optionId: string;
  label: string;
}

export interface WorkingHypothesis {
  statement: string;
  confidence: ConfidenceLevel;
}

export interface DiscoveryResult {
  summary: string;
  confidenceLabel: string;
  nextStep: string;
}

/**
 * The whole memory of a Talk It Out conversation. Held in memory only —
 * Build 1 has no persistence — but shaped so a real Discovery Agent could
 * populate the same fields from a server response.
 */
export interface ConversationState {
  topicId: string | null;
  stage: DiscoveryStage;
  hypothesis: WorkingHypothesis | null;
  evidence: EvidenceItem[];
  pendingQuestion: ClarificationQuestion | null;
  result: DiscoveryResult | null;
}
