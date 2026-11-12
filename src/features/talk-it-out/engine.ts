import {
  conversationStarters,
  discoveryTopics,
  notSureOpeningReply,
  notSureQuestionReply,
  notSureQuestionReplyNoTheory,
  resolvedReply,
  unmatchedReply,
  type DiscoveryBranch,
  type DiscoveryTopic,
} from '../../data/seed/talkItOutScript';
import type {
  ClarificationOption,
  ClarificationQuestion,
  ConversationState,
  EvidenceItem,
  TalkItOutMessage,
} from '../../types';

type DraftMessage = Omit<TalkItOutMessage, 'id'>;

export interface DiscoveryTurn {
  /** What Her Keys says in response. */
  messages: DraftMessage[];
  /** The conversation's memory after this turn. */
  state: ConversationState;
  /** Suggested answers for the question just asked. Empty once resolved. */
  quickReplies: ClarificationOption[];
}

/**
 * This module is the seam where a real intelligence service replaces the
 * prototype. The UI only calls `createInitialState`, `createOpeningMessage`,
 * `openingQuickReplies` and `advance` — a later build can swap the body of
 * `advance` for a call to the real Discovery Agent without touching any
 * rendering code, as long as it keeps returning the same
 * messages / ConversationState / quickReplies shape.
 *
 * The loop it implements is LISTEN → HYPOTHESIZE → CLARIFY → REFINE →
 * RECOMMEND. Unlike the earlier prototype, each user message is interpreted
 * *in the context of the pending question*, not re-matched from scratch
 * against the whole topic catalog. All branching is deterministic and local;
 * nothing here is a language model.
 */

export function createInitialState(): ConversationState {
  return {
    topicId: null,
    stage: 'listening',
    hypothesis: null,
    evidence: [],
    pendingQuestion: null,
    result: null,
  };
}

export function createOpeningMessage(): DraftMessage {
  return {
    speaker: 'herkeys',
    stage: 'listen',
    text: "You don't have to know exactly what's wrong. Just tell me what's going on.",
  };
}

export function openingQuickReplies(): ClarificationOption[] {
  return conversationStarters;
}

export function advance(state: ConversationState, userText: string, optionId?: string): DiscoveryTurn {
  switch (state.stage) {
    case 'listening':
      return openTopic(state, userText, optionId);
    case 'clarifying':
      return refineHypothesis(state, userText, optionId);
    case 'refining':
      return concludeDiscovery(state, userText, optionId);
    default:
      return { messages: [{ speaker: 'herkeys', stage: 'listen', text: resolvedReply }], state, quickReplies: [] };
  }
}

/** Turn 1 — pick a topic and offer an opening theory plus one question. */
function openTopic(state: ConversationState, userText: string, optionId?: string): DiscoveryTurn {
  const topic = (optionId ? findTopic(optionId) : null) ?? matchTopic(userText);

  if (!topic) {
    // "I don't know" at the start is allowed: it is not a failure to be understood, and it is not a reason to pick a topic for her.
    if (saysNotSure(userText)) return { messages: [{ speaker: 'herkeys', stage: 'listen', text: notSureOpeningReply }], state, quickReplies: conversationStarters };
    return {
      messages: [{ speaker: 'herkeys', stage: 'unmatched', text: unmatchedReply }],
      state,
      quickReplies: conversationStarters,
    };
  }

  return {
    messages: [
      { speaker: 'herkeys', stage: 'hypothesis', text: topic.openingHypothesis },
      { speaker: 'herkeys', stage: 'clarify', text: topic.firstQuestion.text },
    ],
    state: {
      ...state,
      topicId: topic.id,
      stage: 'clarifying',
      hypothesis: { statement: topic.openingHypothesis, confidence: 'possible' },
      pendingQuestion: topic.firstQuestion,
    },
    quickReplies: topic.firstQuestion.options,
  };
}

/** Turn 2 — the answer belongs to the pending question, so it sharpens the existing theory. */
function refineHypothesis(state: ConversationState, userText: string, optionId?: string): DiscoveryTurn {
  const topic = state.topicId ? findTopic(state.topicId) : null;
  const question = state.pendingQuestion;
  if (!topic || !question) return restartFallback(state);

  const option = matchOption(question, userText, optionId);
  if (!option) return saysNotSure(userText) ? notSureAnswer(state, question) : notUnderstood(state, question);

  const branch = ownEntry(topic.branches, option.id);
  if (!branch) return notUnderstood(state, question);

  return {
    messages: [
      { speaker: 'herkeys', stage: 'refinement', text: branch.refinedHypothesis },
      { speaker: 'herkeys', stage: 'clarify', text: branch.followUp.text },
    ],
    state: {
      ...state,
      stage: 'refining',
      // Still only possible: one answer in conversation is self-report, not the
      // behavioral evidence a likely pattern needs (HER_KEYS_PRODUCT.md section 15).
      hypothesis: { statement: branch.refinedHypothesis, confidence: 'possible' },
      evidence: [...state.evidence, recordEvidence(question, option, branch.evidence)],
      pendingQuestion: branch.followUp,
    },
    quickReplies: branch.followUp.options,
  };
}

/** Turn 3 — enough evidence to state what seems to be happening, and one small next step. */
function concludeDiscovery(state: ConversationState, userText: string, optionId?: string): DiscoveryTurn {
  const topic = state.topicId ? findTopic(state.topicId) : null;
  const question = state.pendingQuestion;
  if (!topic || !question) return restartFallback(state);

  const branch = findBranchByQuestion(topic, question.id);
  if (!branch) return restartFallback(state);

  const option = matchOption(question, userText, optionId);
  if (!option) return saysNotSure(userText) ? notSureAnswer(state, question) : notUnderstood(state, question);

  const result = ownEntry(branch.outcomes, option.id) ?? branch.fallbackOutcome;
  const evidence = [...state.evidence, recordEvidence(question, option)];

  return {
    messages: [
      {
        speaker: 'herkeys',
        stage: 'result',
        text: result.summary,
        confidenceLabel: result.confidenceLabel,
        confidence: 'possible',
        evidence: evidence.map((item) => item.label),
      },
      { speaker: 'herkeys', stage: 'next-step', text: result.nextStep },
    ],
    state: {
      ...state,
      stage: 'resolved',
      evidence,
      pendingQuestion: null,
      result,
      hypothesis: { statement: result.summary, confidence: 'possible' },
    },
    quickReplies: [],
  };
}

/**
 * "I don't know yet" to a question on the table. The answer is honoured, not corrected: nothing is recorded as evidence (a guess would be
 * fabricated certainty), the conversation does not move, the theory is restated as still only a theory, and the same question stays open
 * with the same choices so she can answer when something fits.
 */
function notSureAnswer(state: ConversationState, question: ClarificationQuestion): DiscoveryTurn {
  const theory = state.hypothesis;
  const messages: DraftMessage[] = theory
    ? [
        { speaker: 'herkeys', stage: 'listen', text: notSureQuestionReply },
        { speaker: 'herkeys', stage: 'hypothesis', text: theory.statement, confidence: 'possible' },
        { speaker: 'herkeys', stage: 'clarify', text: question.text },
      ]
    : [
        { speaker: 'herkeys', stage: 'listen', text: notSureQuestionReplyNoTheory },
        { speaker: 'herkeys', stage: 'clarify', text: question.text },
      ];
  return { messages, state, quickReplies: question.options };
}

const NOT_SURE: readonly RegExp[] = [
  /\b(?:dont|do not) (?:really )?(?:know|have a clue)\b/,
  /\bnot (?:really |entirely )?(?:sure|certain)\b/,
  /\b(?:no|not any) (?:real )?(?:idea|clue)\b/,
  /\bunsure\b/,
  /\b(?:idk|dunno)\b/,
  /\bhard to say\b/,
  /\bcant (?:really )?(?:say|tell)\b/,
];

/** A short message that says she does not know. A long one is narrative, not an answer, and keeps the existing handling. */
export function saysNotSure(userText: string): boolean {
  const plain = userText
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (plain.length === 0 || plain.split(' ').length > 10) return false;
  return NOT_SURE.some((pattern) => pattern.test(plain));
}

function notUnderstood(state: ConversationState, question: ClarificationQuestion): DiscoveryTurn {
  return {
    messages: [{ speaker: 'herkeys', stage: 'unmatched', text: unmatchedReply }],
    state,
    quickReplies: question.options,
  };
}

function restartFallback(_state: ConversationState): DiscoveryTurn {
  // Back to listening means a clean slate: a topic or evidence carried over
  // would be stored as an investigation that never happened (HK-AUDIT-037).
  return {
    messages: [{ speaker: 'herkeys', stage: 'unmatched', text: unmatchedReply }],
    state: createInitialState(),
    quickReplies: conversationStarters,
  };
}

/** Ids reach these lookups from stored state, so inherited keys like `constructor` must never match (HK-AUDIT-039). */
function ownEntry<T>(record: Record<string, T>, key: string): T | undefined {
  return Object.prototype.hasOwnProperty.call(record, key) ? record[key] : undefined;
}

function recordEvidence(question: ClarificationQuestion, option: ClarificationOption, override?: string): EvidenceItem {
  return {
    questionId: question.id,
    optionId: option.id,
    label: override ?? option.evidenceLabel ?? option.label,
  };
}

function findTopic(id: string): DiscoveryTopic | null {
  return discoveryTopics.find((topic) => topic.id === id) ?? null;
}

function findBranchByQuestion(topic: DiscoveryTopic, questionId: string): DiscoveryBranch | null {
  return Object.values(topic.branches).find((branch) => branch.followUp.id === questionId) ?? null;
}

function matchTopic(userText: string): DiscoveryTopic | null {
  const tokens = tokenize(userText);
  let best: { topic: DiscoveryTopic; score: number } | null = null;

  for (const topic of discoveryTopics) {
    // Summed rather than max: a message that hits several of a topic's
    // keywords is a stronger signal than one long phrase hitting once.
    const score = totalPhraseScore(tokens, topic.keywords);
    if (score > 0 && (!best || score > best.score)) best = { topic, score };
  }

  return best?.topic ?? null;
}

function matchOption(
  question: ClarificationQuestion,
  userText: string,
  optionId?: string
): ClarificationOption | null {
  if (optionId) {
    const picked = question.options.find((option) => option.id === optionId);
    if (picked) return picked;
  }

  const tokens = tokenize(userText);
  let best: { option: ClarificationOption; score: number } | null = null;

  for (const option of question.options) {
    const score = bestPhraseScore(tokens, [...option.keywords, option.label]);
    if (score > 0 && (!best || score > best.score)) best = { option, score };
  }

  return best?.option ?? null;
}

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(Boolean)
  );
}

/**
 * A phrase matches when every word in it appears somewhere in the user's
 * message, so "usually after I pick the kids up" still matches "pick up".
 * Longer phrases score higher, which keeps specific answers ahead of generic ones.
 */
function bestPhraseScore(tokens: Set<string>, phrases: string[]): number {
  let best = 0;
  for (const phrase of phrases) {
    best = Math.max(best, phraseScore(tokens, phrase));
  }
  return best;
}

function totalPhraseScore(tokens: Set<string>, phrases: string[]): number {
  return phrases.reduce((total, phrase) => total + phraseScore(tokens, phrase), 0);
}

function phraseScore(tokens: Set<string>, phrase: string): number {
  const words = phrase
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return 0;
  return words.every((word) => tokens.has(word)) ? words.length : 0;
}
