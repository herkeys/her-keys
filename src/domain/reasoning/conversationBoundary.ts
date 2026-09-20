import type { ConversationState } from '../../types';
import type { DiscoveryRecord } from '../state';

/**
 * The line between talking and remembering.
 *
 * Talk It Out is a conversation. Most of what happens in one should leave no
 * trace in the household record: a question answered, a thought half-formed, a
 * topic she backed out of. Only the *structure* of a matched investigation is
 * durable, and only ever as scripted answers — never her words.
 *
 * Before this module the decision lived inside the write function itself, so
 * "did that turn change my household?" could only be answered by reading the
 * implementation. Naming the outcome makes it answerable, and testable, on its
 * own.
 */
export type ConversationOutcome =
  /** Nothing durable. The turn was talk. */
  | { kind: 'conversation-only'; reason: 'no-topic' | 'unchanged' }
  /** A matched investigation whose structure should be remembered. */
  | { kind: 'structured-discovery'; topicId: string; answers: DiscoveryRecord['answers'] }
  /** She left the topic; the previous record no longer describes anything. */
  | { kind: 'clear-discovery' };

/**
 * Classify a conversation turn against what is already stored.
 *
 * `current` is the stored record, which may be null. The distinction between
 * `conversation-only` and `clear-discovery` matters: an unmatched turn with
 * nothing stored must not be reported as a mutation, or every idle message
 * would look like a state change to the sync engine.
 */
export function classifyConversationOutcome(
  conversation: ConversationState,
  current: DiscoveryRecord | null
): ConversationOutcome {
  if (conversation.topicId === null) {
    return current === null ? { kind: 'conversation-only', reason: 'no-topic' } : { kind: 'clear-discovery' };
  }

  const answers = conversation.evidence.map(({ questionId, optionId }) => ({ questionId, optionId }));

  const unchanged =
    current !== null &&
    current.topicId === conversation.topicId &&
    current.answers.length === answers.length &&
    current.answers.every((a, i) => a.questionId === answers[i].questionId && a.optionId === answers[i].optionId);

  if (unchanged) return { kind: 'conversation-only', reason: 'unchanged' };

  return { kind: 'structured-discovery', topicId: conversation.topicId, answers };
}

/** Whether this outcome is allowed to write to durable household state. */
export function mutatesDurableState(outcome: ConversationOutcome): boolean {
  return outcome.kind !== 'conversation-only';
}
